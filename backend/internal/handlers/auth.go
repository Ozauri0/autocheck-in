package handlers

import (
	"context"
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

// dummyHash se compara cuando el email no existe (mismo coste que un admin real).
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("autocheckin-dummy"), bcrypt.DefaultCost)

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
	var u models.User
	err := s.store.Users.FindOne(r.Context(), bson.M{"email": email}).Decode(&u)
	if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
		fail(w, r, err)
		return
	}
	if err != nil {
		// Igualar el tiempo de respuesta para no revelar qué emails existen.
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(in.Password))
		writeError(w, 401, "credenciales inválidas")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)) != nil {
		writeError(w, 401, "credenciales inválidas")
		return
	}
	token, err := auth.NewToken(s.cfg.JWTSecret, u.ID.Hex(), time.Now())
	if err != nil {
		fail(w, r, err)
		return
	}
	u.Normalize()
	writeJSON(w, 200, map[string]any{"token": token, "admin": u})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, err := s.findUser(r.Context(), auth.UserID(r.Context()))
	if errors.Is(err, mongo.ErrNoDocuments) {
		writeError(w, 401, "no autorizado")
		return
	}
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, u)
}

// findUser busca por id hexadecimal; un id mal formado equivale a no encontrado.
func (s *Server) findUser(ctx context.Context, hex string) (models.User, error) {
	var u models.User
	id, err := bson.ObjectIDFromHex(hex)
	if err != nil || s.store == nil {
		return u, mongo.ErrNoDocuments
	}
	err = s.store.Users.FindOne(ctx, bson.M{"_id": id}).Decode(&u)
	u.Normalize()
	return u, err
}

// roleOf alimenta los middlewares: el rol se consulta en cada petición, así un
// cambio de rol o un borrado surten efecto de inmediato. "" = usuario inexistente.
func (s *Server) roleOf(ctx context.Context, id string) (string, error) {
	u, err := s.findUser(ctx, id)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return u.Role, nil
}
