// Package checkin guarda escaneos aplicando idempotencia y la regla "solo el primero cuenta".
package checkin

import (
	"context"
	"errors"
	"hash/fnv"
	"sync"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/uct/autocheckin/backend/internal/models"
)

const (
	StatusCreated   = "created"
	StatusDuplicate = "duplicate"
	StatusExists    = "exists"
	StatusError     = "error"
)

// Recorder serializa las escrituras por (sesión, attendeeKey) para que dos
// tablets simultáneas no dejen dos registros contados. Asume una sola
// instancia de la API.
type Recorder struct {
	coll  *mongo.Collection
	locks [64]sync.Mutex
}

func NewRecorder(coll *mongo.Collection) *Recorder { return &Recorder{coll: coll} }

func (r *Recorder) lock(session bson.ObjectID, key string) func() {
	h := fnv.New32a()
	_, _ = h.Write(session[:])
	_, _ = h.Write([]byte(key))
	m := &r.locks[h.Sum32()%uint32(len(r.locks))]
	m.Lock()
	return m.Unlock
}

// Record inserta c (si su clientId es nuevo) y recalcula los duplicados del par.
func (r *Recorder) Record(ctx context.Context, c models.Checkin) (string, error) {
	if done, err := r.heal(ctx, c.ClientID); err != nil || done {
		return StatusExists, err
	}

	unlock := r.lock(c.SessionID, c.AttendeeKey)
	// Se inserta como duplicado y el recálculo promueve al primero.
	c.Duplicate = true
	_, err := r.coll.InsertOne(ctx, c)
	if mongo.IsDuplicateKeyError(err) {
		unlock()
		return StatusExists, nil
	}
	if err != nil {
		unlock()
		return "", err
	}
	first, err := r.recalc(ctx, c.SessionID, c.AttendeeKey)
	unlock()
	if err != nil {
		return "", err
	}
	if first == c.ID {
		return StatusCreated, nil
	}
	return StatusDuplicate, nil
}

// heal indica si el clientId ya existe; en ese caso recalcula su par, lo que
// repara un envío anterior interrumpido entre la inserción y el recálculo.
func (r *Recorder) heal(ctx context.Context, clientID string) (bool, error) {
	var prev models.Checkin
	err := r.coll.FindOne(ctx, bson.M{"clientId": clientID}).Decode(&prev)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	defer r.lock(prev.SessionID, prev.AttendeeKey)()
	_, err = r.recalc(ctx, prev.SessionID, prev.AttendeeKey)
	return true, err
}

// recalc deja duplicate=false solo en el escaneo más antiguo (a igual hora,
// el recibido primero) y devuelve su id.
func (r *Recorder) recalc(ctx context.Context, session bson.ObjectID, key string) (bson.ObjectID, error) {
	filter := bson.M{"sessionId": session, "attendeeKey": key}
	var first models.Checkin
	err := r.coll.FindOne(ctx, filter, options.FindOne().SetSort(bson.D{
		{Key: "scannedAt", Value: 1}, {Key: "receivedAt", Value: 1}, {Key: "_id", Value: 1},
	})).Decode(&first)
	if err != nil {
		return bson.NilObjectID, err
	}
	if _, err := r.coll.UpdateMany(ctx,
		bson.M{"sessionId": session, "attendeeKey": key, "_id": bson.M{"$ne": first.ID}},
		bson.M{"$set": bson.M{"duplicate": true}}); err != nil {
		return bson.NilObjectID, err
	}
	_, err = r.coll.UpdateByID(ctx, first.ID, bson.M{"$set": bson.M{"duplicate": false}})
	return first.ID, err
}
