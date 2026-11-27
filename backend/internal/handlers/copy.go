package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/uct/autocheckin/backend/internal/models"
)

// copyEvent duplica un evento y sus sesiones (sin check-ins), inactivo. Con
// startDate desplaza todas las fechas por la diferencia con el inicio original.
func (s *Server) copyEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Name      string     `json:"name"`
		StartDate *time.Time `json:"startDate"`
	}
	// El cuerpo es opcional.
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	if err := dec.Decode(&in); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, 400, "JSON inválido: "+err.Error())
		return
	}
	ctx := r.Context()
	e, err := s.findEvent(ctx, id)
	if err != nil {
		fail(w, r, err)
		return
	}
	sessions, err := s.sessionsOf(ctx, id)
	if err != nil {
		fail(w, r, err)
		return
	}

	var shift time.Duration
	if in.StartDate != nil {
		shift = utc(*in.StartDate).Sub(e.StartDate)
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = e.Name + " (copia)"
	}
	now := models.Now()
	e.ID, e.Name, e.Active = bson.NewObjectID(), name, false
	e.StartDate, e.EndDate = e.StartDate.Add(shift), e.EndDate.Add(shift)
	e.CreatedAt, e.UpdatedAt = now, now
	copies := make([]models.Session, len(sessions))
	for i, se := range sessions {
		se.ID, se.EventID = bson.NewObjectID(), e.ID
		se.StartsAt, se.EndsAt = se.StartsAt.Add(shift), se.EndsAt.Add(shift)
		se.CreatedAt, se.UpdatedAt = now, now
		copies[i] = se
	}

	// El evento se inserta al final: una copia a medias no llega a verse.
	if err := s.insertCopy(ctx, e, copies); err != nil {
		_, _ = s.store.Sessions.DeleteMany(context.WithoutCancel(ctx), bson.M{"eventId": e.ID})
		fail(w, r, err)
		return
	}
	writeJSON(w, 201, e)
}

func (s *Server) insertCopy(ctx context.Context, e models.Event, sessions []models.Session) error {
	if len(sessions) > 0 {
		if _, err := s.store.Sessions.InsertMany(ctx, sessions); err != nil {
			return err
		}
	}
	_, err := s.store.Events.InsertOne(ctx, e)
	return err
}
