package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestToken(t *testing.T) {
	tok, err := NewToken("s", "abc", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if id, err := ParseToken("s", tok); err != nil || id != "abc" {
		t.Fatalf("id=%q err=%v", id, err)
	}
	if _, err := ParseToken("otro", tok); err == nil {
		t.Fatal("firma inválida aceptada")
	}
	old, _ := NewToken("s", "abc", time.Now().Add(-13*time.Hour))
	if _, err := ParseToken("s", old); err == nil {
		t.Fatal("token expirado aceptado")
	}
}

func TestMiddleware(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	lookup := func(_ context.Context, id string) (string, error) {
		if id == "roto" {
			return "", errors.New("sin base de datos")
		}
		return map[string]string{"jefa": "admin", "ayu": "ayudante"}[id], nil
	}
	bearer := func(id string) string {
		tok, _ := NewToken("s", id, time.Now())
		return "Bearer " + tok
	}
	admin := RequireRole("s", lookup, "admin")(ok)
	device := RequireDevice("k", "s", lookup)(ok)
	tests := []struct {
		name, header, value string
		h                   http.Handler
		want                int
	}{
		{"admin ok", "Authorization", bearer("jefa"), admin, 200},
		{"admin sin token", "Authorization", "", admin, 401},
		{"admin basura", "Authorization", "Bearer x.y.z", admin, 401},
		{"admin con ayudante", "Authorization", bearer("ayu"), admin, 403},
		{"admin con usuario borrado", "Authorization", bearer("nadie"), admin, 401},
		{"admin con device key", "X-Device-Key", "k", admin, 401},
		{"fallo al consultar", "Authorization", bearer("roto"), admin, 500},
		{"device ok", "X-Device-Key", "k", device, 200},
		{"device mala", "X-Device-Key", "z", device, 401},
		{"device sin config", "X-Device-Key", "", RequireDevice("", "s", lookup)(ok), 401},
		{"device con bearer admin", "Authorization", bearer("jefa"), device, 200},
		{"device con bearer ayudante", "Authorization", bearer("ayu"), device, 200},
		{"device con usuario borrado", "Authorization", bearer("nadie"), device, 401},
		{"device con bearer inválido", "Authorization", "Bearer x.y.z", device, 401},
	}
	for _, tc := range tests {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set(tc.header, tc.value)
		w := httptest.NewRecorder()
		tc.h.ServeHTTP(w, r)
		if w.Code != tc.want {
			t.Errorf("%s: status %d, want %d", tc.name, w.Code, tc.want)
		}
	}
}
