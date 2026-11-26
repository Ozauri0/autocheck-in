package handlers

import (
	"bytes"
	"net/http"
	"regexp"
	"strconv"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/uct/autocheckin/backend/internal/export"
	"github.com/uct/autocheckin/backend/internal/models"
)

const (
	defaultLimit = 50
	maxLimit     = 1000
	maxPage      = 1_000_000
)

// eventScope valida el evento de la ruta y el filtro opcional sessionId.
func (s *Server) eventScope(w http.ResponseWriter, r *http.Request) (models.Event, bson.M, bool) {
	id, ok := pathID(w, r)
	if !ok {
		return models.Event{}, nil, false
	}
	filter := bson.M{"eventId": id}
	if v := r.URL.Query().Get("sessionId"); v != "" {
		sid, err := bson.ObjectIDFromHex(v)
		if err != nil {
			writeError(w, 400, "sessionId inválido")
			return models.Event{}, nil, false
		}
		filter["sessionId"] = sid
	}
	e, err := s.findEvent(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return e, nil, false
	}
	return e, filter, true
}

func positiveParam(r *http.Request, name string, def, max int) (int, bool) {
	v := r.URL.Query().Get(name)
	if v == "" {
		return def, true
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return 0, false
	}
	return min(n, max), true
}

func (s *Server) listCheckins(w http.ResponseWriter, r *http.Request) {
	e, filter, ok := s.eventScope(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	switch q.Get("includeDuplicates") {
	case "", "false":
		filter["duplicate"] = false
	case "true":
	default:
		writeError(w, 400, "includeDuplicates debe ser true o false")
		return
	}
	page, ok1 := positiveParam(r, "page", 1, maxPage)
	limit, ok2 := positiveParam(r, "limit", defaultLimit, maxLimit)
	if !ok1 || !ok2 {
		writeError(w, 400, "page y limit deben ser enteros positivos")
		return
	}
	if search := q.Get("q"); search != "" {
		re := bson.Regex{Pattern: regexp.QuoteMeta(search), Options: "i"}
		filter["$or"] = bson.A{
			bson.M{"attendee.name": re}, bson.M{"attendee.rut": re}, bson.M{"attendee.email": re},
		}
	}

	ctx := r.Context()
	total, err := s.store.Checkins.CountDocuments(ctx, filter)
	if err != nil {
		fail(w, r, err)
		return
	}
	cur, err := s.store.Checkins.Find(ctx, filter, options.Find().
		SetSort(bson.D{{Key: "scannedAt", Value: -1}, {Key: "_id", Value: -1}}).
		SetSkip(int64(page-1)*int64(limit)).SetLimit(int64(limit)))
	if err != nil {
		fail(w, r, err)
		return
	}
	var found []models.Checkin
	if err := cur.All(ctx, &found); err != nil {
		fail(w, r, err)
		return
	}
	sessions, err := s.sessionsOf(ctx, e.ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	names := map[bson.ObjectID]string{}
	for _, sess := range sessions {
		names[sess.ID] = sess.Name
	}
	type item struct {
		models.Checkin
		SessionName string `json:"sessionName"`
	}
	items := make([]item, 0, len(found))
	for _, c := range found {
		items = append(items, item{c, names[c.SessionID]})
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "page": page, "limit": limit})
}

func (s *Server) stats(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	if _, err := s.findEvent(ctx, id); err != nil {
		fail(w, r, err)
		return
	}
	sessions, err := s.sessionsOf(ctx, id)
	if err != nil {
		fail(w, r, err)
		return
	}
	match := bson.M{"eventId": id, "duplicate": false}
	counts, err := countBy(ctx, s.store.Checkins, match, "sessionId")
	if err != nil {
		fail(w, r, err)
		return
	}
	cur, err := s.store.Checkins.Aggregate(ctx, bson.A{
		bson.M{"$match": match},
		bson.M{"$group": bson.M{"_id": "$attendeeKey"}},
		bson.M{"$count": "n"},
	})
	if err != nil {
		fail(w, r, err)
		return
	}
	var unique []struct {
		N int `bson:"n"`
	}
	if err := cur.All(ctx, &unique); err != nil {
		fail(w, r, err)
		return
	}

	type sessionStat struct {
		SessionID bson.ObjectID `json:"sessionId"`
		Name      string        `json:"name"`
		Room      string        `json:"room"`
		Count     int           `json:"count"`
	}
	out := struct {
		TotalCheckins   int           `json:"totalCheckins"`
		UniqueAttendees int           `json:"uniqueAttendees"`
		Sessions        []sessionStat `json:"sessions"`
	}{Sessions: []sessionStat{}}
	for _, sess := range sessions {
		out.Sessions = append(out.Sessions, sessionStat{sess.ID, sess.Name, sess.Room, counts[sess.ID]})
	}
	for _, n := range counts {
		out.TotalCheckins += n
	}
	if len(unique) > 0 {
		out.UniqueAttendees = unique[0].N
	}
	writeJSON(w, 200, out)
}

func (s *Server) exportXLSX(w http.ResponseWriter, r *http.Request) {
	e, filter, ok := s.eventScope(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	sessions, err := s.sessionsOf(ctx, e.ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	if sid, ok := filter["sessionId"]; ok {
		var only []models.Session
		for _, sess := range sessions {
			if sess.ID == sid {
				only = append(only, sess)
			}
		}
		if only == nil {
			writeError(w, 404, "sesión no encontrada en el evento")
			return
		}
		sessions = only
	}
	checkins, err := findAll[models.Checkin](ctx, s.store.Checkins, filter,
		bson.D{{Key: "scannedAt", Value: 1}, {Key: "_id", Value: 1}})
	if err != nil {
		fail(w, r, err)
		return
	}
	var buf bytes.Buffer
	if err := export.Write(&buf, sessions, checkins, s.cfg.Location); err != nil {
		fail(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="asistencia-`+e.ID.Hex()+`.xlsx"`)
	w.Header().Set("Content-Length", strconv.Itoa(buf.Len()))
	_, _ = w.Write(buf.Bytes())
}
