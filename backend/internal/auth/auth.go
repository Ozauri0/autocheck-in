// Package auth emite y valida JWT de usuarios, aplica roles y valida la clave de dispositivo.
package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"log"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/uct/autocheckin/backend/internal/models"
)

const TokenTTL = 12 * time.Hour

type ctxKey struct{}

// NewToken firma un JWT HS256 con el id del usuario como subject.
func NewToken(secret, userID string, now time.Time) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   userID,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(TokenTTL)),
	}).SignedString([]byte(secret))
}

// ParseToken valida firma, algoritmo y expiración; devuelve el subject.
func ParseToken(secret, token string) (string, error) {
	claims := &jwt.RegisteredClaims{}
	_, err := jwt.ParseWithClaims(token, claims,
		func(*jwt.Token) (any, error) { return []byte(secret), nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired())
	if err != nil {
		return "", err
	}
	return claims.Subject, nil
}

// RoleLookup devuelve el rol actual de un usuario, o "" si no existe.
type RoleLookup func(ctx context.Context, userID string) (string, error)

// UserID devuelve el id del usuario autenticado.
func UserID(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

func deny(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}` + "\n"))
}

// authenticate exige un `Authorization: Bearer <token>` válido de un usuario que
// aún existe y cuyo rol esté entre los permitidos (401 / 403).
func authenticate(w http.ResponseWriter, r *http.Request, secret string, lookup RoleLookup, next http.Handler, roles []string) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		deny(w, 401, "no autorizado")
		return
	}
	id, err := ParseToken(secret, token)
	if err != nil || id == "" {
		deny(w, 401, "no autorizado")
		return
	}
	role, err := lookup(r.Context(), id)
	switch {
	case err != nil:
		log.Printf("auth: %v", err)
		deny(w, 500, "error interno")
	case role == "":
		deny(w, 401, "no autorizado")
	case !slices.Contains(roles, role):
		deny(w, 403, "no tiene permisos para esta acción")
	default:
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, id)))
	}
}

// RequireRole exige el Bearer de un usuario con alguno de los roles dados.
func RequireRole(secret string, lookup RoleLookup, roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authenticate(w, r, secret, lookup, next, roles)
		})
	}
}

// RequireDevice exige el header X-Device-Key (comparación en tiempo constante)
// o, como alternativa, el Bearer de cualquier usuario (escáner web del panel).
func RequireDevice(key, secret string, lookup RoleLookup) func(http.Handler) http.Handler {
	want := sha256.Sum256([]byte(key))
	roles := []string{models.RoleAdmin, models.RoleAyudante}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := sha256.Sum256([]byte(r.Header.Get("X-Device-Key")))
			if key != "" && subtle.ConstantTimeCompare(got[:], want[:]) == 1 {
				next.ServeHTTP(w, r)
				return
			}
			authenticate(w, r, secret, lookup, next, roles)
		})
	}
}
