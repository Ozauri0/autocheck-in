package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"golang.org/x/crypto/bcrypt"

	"github.com/uct/autocheckin/backend/internal/auth"
	"github.com/uct/autocheckin/backend/internal/models"
)

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if email == "" || in.Password == "" {
		writeError(w, 400, "email y password son obligatorios")
		return
	}
	var a models.Admin
	err := s.store.Admins.FindOne(r.Context(), bson.M{"email": email}).Decode(&a)
	if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
		fail(w, r, err)
		return
	}
	if err != nil || bcrypt.CompareHashAndPassword([]byte(a.PasswordHash), []byte(in.Password)) != nil {
		writeError(w, 401, "credenciales inválidas")
		return
	}
	token, err := auth.NewToken(s.cfg.JWTSecret, a.ID.Hex(), time.Now())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"token": token, "admin": a})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	id, err := bson.ObjectIDFromHex(auth.AdminID(r.Context()))
	if err != nil {
		writeError(w, 401, "no autorizado")
		return
	}
	var a models.Admin
	err = s.store.Admins.FindOne(r.Context(), bson.M{"_id": id}).Decode(&a)
	if errors.Is(err, mongo.ErrNoDocuments) {
		writeError(w, 401, "no autorizado")
		return
	}
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, a)
}
