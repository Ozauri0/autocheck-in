// Package seeder carga un evento y sus sesiones desde JSON, de forma idempotente.
package seeder

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/uct/autocheckin/backend/internal/db"
	"github.com/uct/autocheckin/backend/internal/models"
)

type File struct {
	Event struct {
		Name        string    `json:"name"`
		Description string    `json:"description"`
		Location    string    `json:"location"`
		StartDate   time.Time `json:"startDate"`
		EndDate     time.Time `json:"endDate"`
		Active      *bool     `json:"active"`
	} `json:"event"`
	Sessions []struct {
		Name     string    `json:"name"`
		Room     string    `json:"room"`
		StartsAt time.Time `json:"startsAt"`
		EndsAt   time.Time `json:"endsAt"`
		Order    int       `json:"order"`
	} `json:"sessions"`
}

// Parse lee y valida el archivo.
func Parse(r io.Reader) (File, error) {
	var f File
	if err := json.NewDecoder(r).Decode(&f); err != nil {
		return f, fmt.Errorf("JSON inválido: %w", err)
	}
	if strings.TrimSpace(f.Event.Name) == "" || f.Event.StartDate.IsZero() || f.Event.EndDate.IsZero() {
		return f, errors.New("event requiere name, startDate y endDate")
	}
	seen := map[string]bool{}
	for i, s := range f.Sessions {
		if strings.TrimSpace(s.Name) == "" || s.StartsAt.IsZero() || s.EndsAt.IsZero() {
			return f, fmt.Errorf("sessions[%d] requiere name, startsAt y endsAt", i)
		}
		k := sessionKey(s.Name, s.StartsAt)
		// Sesiones paralelas con igual nombre y hora se distinguen por sala.
		k += "\x00" + s.Room
		if seen[k] {
			return f, fmt.Errorf("sessions[%d] repetida (name, startsAt, room)", i)
		}
		seen[k] = true
	}
	return f, nil
}

func sessionKey(name string, startsAt time.Time) string {
	return strings.TrimSpace(name) + "\x00" + startsAt.UTC().Truncate(time.Millisecond).Format(time.RFC3339Nano)
}

type Result struct {
	EventID                         bson.ObjectID
	Created, Updated, Removed, Kept int
}

// Apply crea o actualiza el evento (por nombre). Las sesiones con igual
// name+startsAt conservan su id (y sus check-ins). Las que ya no están en el
// archivo se eliminan, salvo que tengan check-ins: esas se conservan (Kept).
func Apply(ctx context.Context, store *db.Store, f File) (Result, error) {
	var res Result
	now := models.Now()
	name := strings.TrimSpace(f.Event.Name)

	var ev models.Event
	err := store.Events.FindOne(ctx, bson.M{"name": name}).Decode(&ev)
	isNew := errors.Is(err, mongo.ErrNoDocuments)
	if err != nil && !isNew {
		return res, err
	}
	if isNew {
		ev = models.Event{ID: bson.NewObjectID(), Name: name, CreatedAt: now}
	}
	ev.Description, ev.Location = f.Event.Description, f.Event.Location
	ev.StartDate, ev.EndDate = f.Event.StartDate.UTC(), f.Event.EndDate.UTC()
	ev.Active = f.Event.Active == nil || *f.Event.Active
	ev.UpdatedAt = now
	if isNew {
		_, err = store.Events.InsertOne(ctx, ev)
	} else {
		_, err = store.Events.ReplaceOne(ctx, bson.M{"_id": ev.ID}, ev)
	}
	if err != nil {
		return res, err
	}
	res.EventID = ev.ID

	cur, err := store.Sessions.Find(ctx, bson.M{"eventId": ev.ID})
	if err != nil {
		return res, err
	}
	var existing []models.Session
	if err := cur.All(ctx, &existing); err != nil {
		return res, err
	}
	pool := map[string][]models.Session{}
	for _, s := range existing {
		k := sessionKey(s.Name, s.StartsAt)
		pool[k] = append(pool[k], s)
	}

	// Primero se emparejan las de igual sala; el resto toma cualquiera libre.
	matched := make([]*models.Session, len(f.Sessions))
	for _, sameRoom := range []bool{true, false} {
		for i, in := range f.Sessions {
			if matched[i] != nil {
				continue
			}
			k := sessionKey(in.Name, in.StartsAt)
			for j, s := range pool[k] {
				if !sameRoom || s.Room == in.Room {
					matched[i] = &s
					pool[k] = append(pool[k][:j:j], pool[k][j+1:]...)
					break
				}
			}
		}
	}

	for i, in := range f.Sessions {
		s := models.Session{ID: bson.NewObjectID(), EventID: ev.ID, CreatedAt: now}
		if matched[i] != nil {
			s = *matched[i]
		}
		s.Name, s.Room, s.Order = strings.TrimSpace(in.Name), in.Room, in.Order
		s.StartsAt, s.EndsAt, s.UpdatedAt = in.StartsAt.UTC(), in.EndsAt.UTC(), now
		if matched[i] != nil {
			_, err = store.Sessions.ReplaceOne(ctx, bson.M{"_id": s.ID}, s)
			res.Updated++
		} else {
			_, err = store.Sessions.InsertOne(ctx, s)
			res.Created++
		}
		if err != nil {
			return res, err
		}
	}

	for _, rest := range pool {
		for _, s := range rest {
			n, err := store.Checkins.CountDocuments(ctx, bson.M{"sessionId": s.ID})
			if err != nil {
				return res, err
			}
			if n > 0 {
				res.Kept++
				continue
			}
			if _, err := store.Sessions.DeleteOne(ctx, bson.M{"_id": s.ID}); err != nil {
				return res, err
			}
			res.Removed++
		}
	}
	return res, nil
}
