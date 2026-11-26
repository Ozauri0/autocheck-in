package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/uct/autocheckin/backend/internal/models"
)

type eventInput struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Location    string     `json:"location"`
	StartDate   *time.Time `json:"startDate"`
	EndDate     *time.Time `json:"endDate"`
	Active      *bool      `json:"active"`
}

func (in *eventInput) validate() string {
	in.Name = strings.TrimSpace(in.Name)
	switch {
	case in.Name == "":
		return "name es obligatorio"
	case in.StartDate == nil || in.EndDate == nil:
		return "startDate y endDate son obligatorios"
	case in.EndDate.Before(*in.StartDate):
		return "endDate no puede ser anterior a startDate"
	}
	return ""
}

type sessionInput struct {
	Name     string     `json:"name"`
	Room     string     `json:"room"`
	StartsAt *time.Time `json:"startsAt"`
	EndsAt   *time.Time `json:"endsAt"`
	Order    int        `json:"order"`
}

func (in *sessionInput) validate() string {
	in.Name = strings.TrimSpace(in.Name)
	switch {
	case in.Name == "":
		return "name es obligatorio"
	case in.StartsAt == nil || in.EndsAt == nil:
		return "startsAt y endsAt son obligatorios"
	case in.EndsAt.Before(*in.StartsAt):
		return "endsAt no puede ser anterior a startsAt"
	}
	return ""
}

func utc(t time.Time) time.Time { return t.UTC().Truncate(time.Millisecond) }

func findAll[T any](ctx context.Context, c *mongo.Collection, filter any, sort bson.D) ([]T, error) {
	cur, err := c.Find(ctx, filter, options.Find().SetSort(sort))
	if err != nil {
		return nil, err
	}
	out := []T{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Server) findEvent(ctx context.Context, id bson.ObjectID) (models.Event, error) {
	var e models.Event
	err := s.store.Events.FindOne(ctx, bson.M{"_id": id}).Decode(&e)
	return e, err
}

var sessionSort = bson.D{{Key: "startsAt", Value: 1}, {Key: "order", Value: 1}, {Key: "_id", Value: 1}}

func (s *Server) sessionsOf(ctx context.Context, eventID bson.ObjectID) ([]models.Session, error) {
	return findAll[models.Session](ctx, s.store.Sessions, bson.M{"eventId": eventID}, sessionSort)
}

// countBy agrupa por campo ObjectID y cuenta documentos.
func countBy(ctx context.Context, c *mongo.Collection, match bson.M, field string) (map[bson.ObjectID]int, error) {
	cur, err := c.Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: match}},
		{{Key: "$group", Value: bson.M{"_id": "$" + field, "n": bson.M{"$sum": 1}}}},
	})
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ID bson.ObjectID `bson:"_id"`
		N  int           `bson:"n"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	out := make(map[bson.ObjectID]int, len(rows))
	for _, row := range rows {
		out[row.ID] = row.N
	}
	return out, nil
}

func (s *Server) listEvents(w http.ResponseWriter, r *http.Request) {
	filter := bson.M{}
	switch r.URL.Query().Get("includeInactive") {
	case "", "true":
	case "false":
		filter["active"] = true
	default:
		writeError(w, 400, "includeInactive debe ser true o false")
		return
	}
	ctx := r.Context()
	events, err := findAll[models.Event](ctx, s.store.Events, filter, bson.D{{Key: "startDate", Value: -1}})
	if err != nil {
		fail(w, r, err)
		return
	}
	sessions, err := countBy(ctx, s.store.Sessions, bson.M{}, "eventId")
	if err != nil {
		fail(w, r, err)
		return
	}
	checkins, err := countBy(ctx, s.store.Checkins, bson.M{"duplicate": false}, "eventId")
	if err != nil {
		fail(w, r, err)
		return
	}
	type item struct {
		models.Event
		SessionCount int `json:"sessionCount"`
		CheckinCount int `json:"checkinCount"`
	}
	out := make([]item, 0, len(events))
	for _, e := range events {
		out = append(out, item{e, sessions[e.ID], checkins[e.ID]})
	}
	writeJSON(w, 200, out)
}

type eventWithSessions struct {
	models.Event
	Sessions []models.Session `json:"sessions"`
}

func (s *Server) createEvent(w http.ResponseWriter, r *http.Request) {
	var in eventInput
	if !decode(w, r, &in) {
		return
	}
	if msg := in.validate(); msg != "" {
		writeError(w, 400, msg)
		return
	}
	now := models.Now()
	e := models.Event{
		ID: bson.NewObjectID(), Name: in.Name, Description: in.Description, Location: in.Location,
		StartDate: utc(*in.StartDate), EndDate: utc(*in.EndDate),
		Active: in.Active == nil || *in.Active, CreatedAt: now, UpdatedAt: now,
	}
	if _, err := s.store.Events.InsertOne(r.Context(), e); err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 201, e)
}

func (s *Server) getEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	e, err := s.findEvent(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	sessions, err := s.sessionsOf(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, eventWithSessions{e, sessions})
}

func (s *Server) patchEvent(w http.ResponseWriter, r *http.Request, id bson.ObjectID, set bson.M) {
	set["updatedAt"] = models.Now()
	var e models.Event
	err := s.store.Events.FindOneAndUpdate(r.Context(), bson.M{"_id": id}, bson.M{"$set": set},
		options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&e)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, e)
}

func (s *Server) updateEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in eventInput
	if !decode(w, r, &in) {
		return
	}
	if msg := in.validate(); msg != "" {
		writeError(w, 400, msg)
		return
	}
	set := bson.M{
		"name": in.Name, "description": in.Description, "location": in.Location,
		"startDate": utc(*in.StartDate), "endDate": utc(*in.EndDate),
	}
	if in.Active != nil {
		set["active"] = *in.Active
	}
	s.patchEvent(w, r, id, set)
}

func (s *Server) setEventActive(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Active *bool `json:"active"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Active == nil {
		writeError(w, 400, "active es obligatorio")
		return
	}
	s.patchEvent(w, r, id, bson.M{"active": *in.Active})
}

func (s *Server) deleteEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	if _, err := s.findEvent(ctx, id); err != nil {
		fail(w, r, err)
		return
	}
	// El evento se borra al final: si algo falla, se puede reintentar.
	for _, c := range []*mongo.Collection{s.store.Checkins, s.store.Sessions} {
		if _, err := c.DeleteMany(ctx, bson.M{"eventId": id}); err != nil {
			fail(w, r, err)
			return
		}
	}
	if _, err := s.store.Events.DeleteOne(ctx, bson.M{"_id": id}); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createSession(w http.ResponseWriter, r *http.Request) {
	eventID, ok := pathID(w, r)
	if !ok {
		return
	}
	var in sessionInput
	if !decode(w, r, &in) {
		return
	}
	if msg := in.validate(); msg != "" {
		writeError(w, 400, msg)
		return
	}
	if _, err := s.findEvent(r.Context(), eventID); err != nil {
		fail(w, r, err)
		return
	}
	now := models.Now()
	sess := models.Session{
		ID: bson.NewObjectID(), EventID: eventID, Name: in.Name, Room: in.Room,
		StartsAt: utc(*in.StartsAt), EndsAt: utc(*in.EndsAt), Order: in.Order,
		CreatedAt: now, UpdatedAt: now,
	}
	if _, err := s.store.Sessions.InsertOne(r.Context(), sess); err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 201, sess)
}

func (s *Server) updateSession(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in sessionInput
	if !decode(w, r, &in) {
		return
	}
	if msg := in.validate(); msg != "" {
		writeError(w, 400, msg)
		return
	}
	var sess models.Session
	err := s.store.Sessions.FindOneAndUpdate(r.Context(), bson.M{"_id": id}, bson.M{"$set": bson.M{
		"name": in.Name, "room": in.Room, "startsAt": utc(*in.StartsAt), "endsAt": utc(*in.EndsAt),
		"order": in.Order, "updatedAt": models.Now(),
	}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&sess)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, sess)
}

func (s *Server) deleteSession(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	if err := s.store.Sessions.FindOne(ctx, bson.M{"_id": id}).Err(); err != nil {
		fail(w, r, err)
		return
	}
	if _, err := s.store.Checkins.DeleteMany(ctx, bson.M{"sessionId": id}); err != nil {
		fail(w, r, err)
		return
	}
	if _, err := s.store.Sessions.DeleteOne(ctx, bson.M{"_id": id}); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
