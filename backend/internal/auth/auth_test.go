package auth

import (
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
	tok, _ := NewToken("s", "abc", time.Now())
	tests := []struct {
		name, header, value string
		h                   http.Handler
		want                int
	}{
		{"admin ok", "Authorization", "Bearer " + tok, RequireAdmin("s")(ok), 200},
		{"admin sin token", "Authorization", "", RequireAdmin("s")(ok), 401},
		{"admin basura", "Authorization", "Bearer x.y.z", RequireAdmin("s")(ok), 401},
		{"device ok", "X-Device-Key", "k", RequireDevice("k")(ok), 200},
		{"device mala", "X-Device-Key", "z", RequireDevice("k")(ok), 401},
		{"device sin config", "X-Device-Key", "", RequireDevice("")(ok), 401},
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
