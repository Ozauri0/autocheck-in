package handlers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/uct/autocheckin/backend/internal/checkin"
	"github.com/uct/autocheckin/backend/internal/models"
	"github.com/uct/autocheckin/backend/internal/qr"
)

const (
	maxBatch = 500
	maxRaw   = 4096
	maxField = 200
)

func (s *Server) deviceEvents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	events, err := findAll[models.Event](ctx, s.store.Events, bson.M{"active": true},
		bson.D{{Key: "startDate", Value: 1}})
	if err != nil {
		fail(w, r, err)
		return
	}
	ids := bson.A{}
	for _, e := range events {
		ids = append(ids, e.ID)
	}
	sessions, err := findAll[models.Session](ctx, s.store.Sessions, bson.M{"eventId": bson.M{"$in": ids}}, sessionSort)
	if err != nil {
		fail(w, r, err)
		return
	}
	byEvent := map[bson.ObjectID][]models.Session{}
	for _, sess := range sessions {
		byEvent[sess.EventID] = append(byEvent[sess.EventID], sess)
	}
	out := make([]eventWithSessions, 0, len(events))
	for _, e := range events {
		list := byEvent[e.ID]
		if list == nil {
			list = []models.Session{}
		}
		out = append(out, eventWithSessions{e, list})
	}
	writeJSON(w, 200, out)
}

// checkinInput usa strings para que un ítem mal formado no rechace el lote.
type checkinInput struct {
	ClientID   string `json:"clientId"`
	EventID    string `json:"eventId"`
	SessionID  string `json:"sessionId"`
	DeviceID   string `json:"deviceId"`
	DeviceName string `json:"deviceName"`
	Raw        string `json:"raw"`
	ScannedAt  string `json:"scannedAt"`
}

type checkinResult struct {
	ClientID  string `json:"clientId"`
	Status    string `json:"status"`
	Duplicate bool   `json:"duplicate"`
	Message   string `json:"message,omitempty"`
}

// build valida un ítem; devuelve un mensaje si es inválido.
func (in checkinInput) build() (models.Checkin, string) {
	var c models.Checkin
	eventID, errE := bson.ObjectIDFromHex(in.EventID)
	sessionID, errS := bson.ObjectIDFromHex(in.SessionID)
	scannedAt, errT := time.Parse(time.RFC3339, in.ScannedAt)
	switch {
	case strings.TrimSpace(in.ClientID) == "" || len(in.ClientID) > maxField:
		return c, "clientId inválido"
	case errE != nil:
		return c, "eventId inválido"
	case errS != nil:
		return c, "sessionId inválido"
	case errT != nil:
		return c, "scannedAt inválido (RFC3339)"
	case strings.TrimSpace(in.Raw) == "" || len(in.Raw) > maxRaw:
		return c, "raw vacío o demasiado largo"
	case len(in.DeviceID) > maxField || len(in.DeviceName) > maxField:
		return c, "deviceId o deviceName demasiado largo"
	}
	attendee := qr.Parse(in.Raw)
	return models.Checkin{
		ID: bson.NewObjectID(), ClientID: strings.TrimSpace(in.ClientID), EventID: eventID, SessionID: sessionID,
		DeviceID: in.DeviceID, DeviceName: in.DeviceName, Raw: in.Raw,
		Attendee: attendee, AttendeeKey: qr.AttendeeKey(attendee, in.Raw),
		ScannedAt: utc(scannedAt), ReceivedAt: models.Now(),
	}, ""
}

// sessionEvent busca el evento de una sesión (con caché por lote).
func (s *Server) sessionEvent(ctx context.Context, cache map[bson.ObjectID]bson.ObjectID, id bson.ObjectID) (bson.ObjectID, error) {
	if ev, ok := cache[id]; ok {
		return ev, nil
	}
	var sess models.Session
	err := s.store.Sessions.FindOne(ctx, bson.M{"_id": id}).Decode(&sess)
	if errors.Is(err, mongo.ErrNoDocuments) {
		cache[id] = bson.NilObjectID
		return bson.NilObjectID, nil
	}
	if err != nil {
		return bson.NilObjectID, err
	}
	cache[id] = sess.EventID
	return sess.EventID, nil
}

func (s *Server) deviceCheckins(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Checkins []checkinInput `json:"checkins"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Checkins == nil {
		writeError(w, 400, "checkins es obligatorio")
		return
	}
	if len(in.Checkins) > maxBatch {
		writeError(w, 400, "máximo 500 check-ins por envío")
		return
	}
	ctx := r.Context()
	cache := map[bson.ObjectID]bson.ObjectID{}
	results := make([]checkinResult, 0, len(in.Checkins))
	for _, item := range in.Checkins {
		res := checkinResult{ClientID: item.ClientID, Status: checkin.StatusError}
		c, msg := item.build()
		if msg == "" {
			eventID, err := s.sessionEvent(ctx, cache, c.SessionID)
			if err != nil {
				fail(w, r, err) // fallo transitorio: el cliente reintenta el lote (es idempotente)
				return
			}
			switch eventID {
			case bson.NilObjectID:
				msg = "sesión inexistente"
			case c.EventID:
				status, dup, err := s.recorder.Record(ctx, c)
				if err != nil {
					fail(w, r, err)
					return
				}
				res.Status, res.Duplicate = status, dup
			default:
				msg = "la sesión no pertenece al evento"
			}
		}
		res.Message = msg
		results = append(results, res)
	}
	writeJSON(w, 200, map[string]any{"results": results})
}
