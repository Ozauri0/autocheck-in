// Package handlers implementa la API HTTP descrita en docs/API.md.
package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/uct/autocheckin/backend/internal/auth"
	"github.com/uct/autocheckin/backend/internal/checkin"
	"github.com/uct/autocheckin/backend/internal/config"
	"github.com/uct/autocheckin/backend/internal/db"
)

const maxBody = 8 << 20

type Server struct {
	cfg      config.Config
	store    *db.Store
	recorder *checkin.Recorder
}

// New construye el router completo de la API.
func New(cfg config.Config, store *db.Store) http.Handler {
	if cfg.Location == nil {
		cfg.Location = time.UTC
	}
	s := &Server{cfg: cfg, store: store, recorder: checkin.NewRecorder(storeCheckins(store))}

	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Logger, middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: cfg.CORSOrigins,
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-Device-Key"},
		ExposedHeaders: []string{"Content-Disposition"},
		MaxAge:         300,
	}))
	r.NotFound(func(w http.ResponseWriter, _ *http.Request) { writeError(w, 404, "ruta no encontrada") })
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) { writeError(w, 405, "método no permitido") })

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, 200, map[string]string{"status": "ok"})
		})
		r.Post("/auth/login", s.login)

		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAdmin(cfg.JWTSecret))
			r.Get("/auth/me", s.me)
			r.Get("/events", s.listEvents)
			r.Post("/events", s.createEvent)
			r.Get("/events/{id}", s.getEvent)
			r.Put("/events/{id}", s.updateEvent)
			r.Patch("/events/{id}/active", s.setEventActive)
			r.Delete("/events/{id}", s.deleteEvent)
			r.Post("/events/{id}/sessions", s.createSession)
			r.Put("/sessions/{id}", s.updateSession)
			r.Delete("/sessions/{id}", s.deleteSession)
			r.Get("/events/{id}/checkins", s.listCheckins)
			r.Get("/events/{id}/stats", s.stats)
			r.Get("/events/{id}/export.xlsx", s.exportXLSX)
		})

		r.Group(func(r chi.Router) {
			r.Use(auth.RequireDevice(cfg.DeviceAPIKey, cfg.JWTSecret))
			r.Get("/device/events", s.deviceEvents)
			r.Post("/device/checkins", s.deviceCheckins)
		})
	})
	return r
}

func storeCheckins(s *db.Store) *mongo.Collection {
	if s == nil {
		return nil
	}
	return s.Checkins
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("respuesta: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// fail traduce errores de base de datos a 404 o 500.
func fail(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, mongo.ErrNoDocuments) {
		writeError(w, 404, "no encontrado")
		return
	}
	log.Printf("[%s] %s %s: %v", middleware.GetReqID(r.Context()), r.Method, r.URL.Path, err)
	writeError(w, 500, "error interno")
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	if err := dec.Decode(v); err != nil {
		writeError(w, 400, "JSON inválido: "+err.Error())
		return false
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		writeError(w, 400, "JSON inválido: contenido adicional")
		return false
	}
	return true
}

func pathID(w http.ResponseWriter, r *http.Request) (bson.ObjectID, bool) {
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, 400, "id inválido")
		return id, false
	}
	return id, true
}
