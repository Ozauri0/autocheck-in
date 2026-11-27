package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/uct/autocheckin/backend/internal/auth"
	"github.com/uct/autocheckin/backend/internal/config"
	"github.com/uct/autocheckin/backend/internal/db"
)

var testCfg = config.Config{JWTSecret: "s", DeviceAPIKey: "k", CORSOrigins: []string{"http://localhost:3000"}}

type api struct {
	t     *testing.T
	h     http.Handler
	token string
	store *db.Store
}

func (a *api) do(method, path string, body any, want int) map[string]any {
	a.t.Helper()
	w := a.raw(method, path, body)
	if w.Code != want {
		a.t.Fatalf("%s %s: status %d, want %d: %s", method, path, w.Code, want, w.Body)
	}
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return out
}

func (a *api) raw(method, path string, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if s, ok := body.(string); ok {
		buf.WriteString(s)
	} else if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	r := httptest.NewRequest(method, "/api/v1"+path, &buf)
	r.Header.Set("Authorization", "Bearer "+a.token)
	r.Header.Set("X-Device-Key", "k")
	w := httptest.NewRecorder()
	a.h.ServeHTTP(w, r)
	return w
}

// Los endpoints de dispositivo aceptan X-Device-Key sin consultar la base. Se usa
// un cuerpo inválido: 400 significa que la autenticación pasó. Un Bearer necesita
// la base (rol vigente): se prueba en TestRoles y en el paquete auth.
func TestDeviceAuth(t *testing.T) {
	h := New(testCfg, nil)
	expired, _ := auth.NewToken(testCfg.JWTSecret, "admin", time.Now().Add(-13*time.Hour))
	tests := []struct {
		name, key, bearer string
		want              int
	}{
		{"sin credenciales", "", "", 401},
		{"device key", "k", "", 400},
		{"key válida y bearer malo", "k", "x.y.z", 400},
		{"key mala", "mala", "", 401},
		{"bearer expirado", "", expired, 401},
	}
	for _, tc := range tests {
		r := httptest.NewRequest("POST", "/api/v1/device/checkins", strings.NewReader("{"))
		if tc.key != "" {
			r.Header.Set("X-Device-Key", tc.key)
		}
		if tc.bearer != "" {
			r.Header.Set("Authorization", "Bearer "+tc.bearer)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.want {
			t.Errorf("%s: status %d, want %d", tc.name, w.Code, tc.want)
		}
	}
}

// Con base de datos: ambos caminos llegan a leer y registrar.
func TestDeviceEndpointsWithEitherCredential(t *testing.T) {
	a := newAPI(t)
	ev, se := a.fixture()
	for i, header := range [][2]string{{"X-Device-Key", "k"}, {"Authorization", "Bearer " + a.token}} {
		do := func(method, path, body string) string {
			r := httptest.NewRequest(method, "/api/v1"+path, strings.NewReader(body))
			r.Header.Set(header[0], header[1])
			w := httptest.NewRecorder()
			a.h.ServeHTTP(w, r)
			if w.Code != 200 {
				t.Fatalf("%s %s con %s: status %d: %s", method, path, header[0], w.Code, w.Body)
			}
			return w.Body.String()
		}
		if out := do("GET", "/device/events", ""); !strings.Contains(out, se) {
			t.Fatalf("sesión ausente: %s", out)
		}
		out := do("POST", "/device/checkins", fmt.Sprintf(
			`{"checkins":[{"clientId":"e%d","eventId":"%s","sessionId":"%s","raw":"P%d|%d|p@uct.cl","scannedAt":"2026-11-25T12:00:00Z"}]}`,
			i, ev, se, i, i+1))
		if !strings.Contains(out, `"status":"created"`) {
			t.Fatalf("check-in con %s: %s", header[0], out)
		}
	}
}

// Sin base de datos: rutas que fallan antes de consultarla.
func TestWithoutDatabase(t *testing.T) {
	a := &api{t: t, h: New(testCfg, nil)}
	a.do("GET", "/health", nil, 200)
	a.do("GET", "/events", nil, 401)
	a.do("POST", "/auth/login", "{", 400)
	a.do("POST", "/auth/login", `{"email":""}`, 400)
	a.do("POST", "/device/checkins", `{}`, 400)
	a.do("POST", "/device/checkins", map[string]any{"checkins": make([]checkinInput, 501)}, 400)
	a.do("GET", "/nada", nil, 404)
}

func newAPI(t *testing.T) *api {
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		t.Skip("MONGO_URI no definido")
	}
	ctx := context.Background()
	store, err := db.Connect(ctx, uri, "autocheckin_test_"+bson.NewObjectID().Hex())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = store.DB.Drop(ctx)
		_ = store.Close(ctx)
	})
	if err := store.EnsureIndexes(ctx); err != nil {
		t.Fatal(err)
	}
	if err := store.EnsureAdmin(ctx, "Admin@uct.cl", "secreto"); err != nil {
		t.Fatal(err)
	}
	cfg := testCfg
	cfg.Location = time.UTC
	a := &api{t: t, h: New(cfg, store), store: store}
	a.do("POST", "/auth/login", map[string]string{"email": "admin@uct.cl", "password": "mala"}, 401)
	login := a.do("POST", "/auth/login", map[string]string{"email": "admin@uct.cl", "password": "secreto"}, 200)
	a.token = login["token"].(string)
	return a
}

func (a *api) fixture() (eventID, sessionID string) {
	a.t.Helper()
	ev := a.do("POST", "/events", map[string]any{
		"name": "E", "startDate": "2026-11-25T09:00:00-03:00", "endDate": "2026-11-26T18:00:00-03:00",
	}, 201)
	if ev["active"] != true {
		a.t.Fatal("active debe ser true por defecto")
	}
	eventID = ev["id"].(string)
	s := a.do("POST", "/events/"+eventID+"/sessions", map[string]any{
		"name": "S", "startsAt": "2026-11-25T09:00:00-03:00", "endsAt": "2026-11-25T10:00:00-03:00",
	}, 201)
	return eventID, s["id"].(string)
}

func (a *api) send(eventID, sessionID string, items ...[3]string) []string {
	a.t.Helper()
	var list []checkinInput
	for _, it := range items {
		list = append(list, checkinInput{ClientID: it[0], EventID: eventID, SessionID: sessionID, Raw: it[1], ScannedAt: it[2]})
	}
	out := a.do("POST", "/device/checkins", map[string]any{"checkins": list}, 200)
	var statuses []string
	for _, r := range out["results"].([]any) {
		statuses = append(statuses, r.(map[string]any)["status"].(string))
	}
	return statuses
}

func TestDuplicatesOutOfOrder(t *testing.T) {
	a := newAPI(t)
	ev, se := a.fixture()
	got := a.send(ev, se,
		[3]string{"c1", "Ana|1.111-1|a@uct.cl", "2026-11-25T12:10:00Z"},
		[3]string{"c2", "Ana|11111|a@uct.cl", "2026-11-25T12:20:00Z"},
		[3]string{"c3", "Ana|11111|a@uct.cl", "2026-11-25T12:00:00Z"}, // llega tarde pero es anterior
		[3]string{"c1", "Ana|1.111-1|a@uct.cl", "2026-11-25T12:10:00Z"},
		[3]string{"c4", "Ana|11111|a@uct.cl", "2026-11-25T12:00:00Z"}, // misma hora
	)
	if want := "created duplicate created exists duplicate"; strings.Join(got, " ") != want {
		t.Fatalf("statuses = %v, want %s", got, want)
	}
	out := a.do("GET", "/events/"+ev+"/checkins", nil, 200)
	items := out["items"].([]any)
	if out["total"].(float64) != 1 || items[0].(map[string]any)["clientId"] != "c3" || items[0].(map[string]any)["sessionName"] != "S" {
		t.Fatalf("solo c3 debe contar: %v", out)
	}
	if all := a.do("GET", "/events/"+ev+"/checkins?includeDuplicates=true&q=ANA&limit=2", nil, 200); all["total"].(float64) != 4 || len(all["items"].([]any)) != 2 {
		t.Fatalf("listado: %v", all)
	}
	if none := a.do("GET", "/events/"+ev+"/checkins?q=.*", nil, 200); none["total"].(float64) != 0 {
		t.Fatal("q no debe interpretarse como regex")
	}
	st := a.do("GET", "/events/"+ev+"/stats", nil, 200)
	if st["totalCheckins"].(float64) != 1 || st["uniqueAttendees"].(float64) != 1 {
		t.Fatalf("stats: %v", st)
	}
	x := a.raw("GET", "/events/"+ev+"/export.xlsx?sessionId="+se, nil)
	if x.Code != 200 || !bytes.HasPrefix(x.Body.Bytes(), []byte("PK")) {
		t.Fatalf("export: %d", x.Code)
	}
}

func TestConcurrentSameAttendee(t *testing.T) {
	a := newAPI(t)
	ev, se := a.fixture()
	done := make(chan *httptest.ResponseRecorder)
	for i := range 20 {
		go func() {
			done <- a.raw("POST", "/device/checkins", map[string]any{"checkins": []checkinInput{{
				ClientID: fmt.Sprintf("p%d", i), EventID: ev, SessionID: se, Raw: "B|2|b@uct.cl",
				ScannedAt: fmt.Sprintf("2026-11-25T12:00:%02dZ", 59-i),
			}}})
		}()
	}
	for range 20 {
		if w := <-done; w.Code != 200 {
			t.Fatalf("status %d", w.Code)
		}
	}
	out := a.do("GET", "/events/"+ev+"/checkins", nil, 200)
	if out["total"].(float64) != 1 || out["items"].([]any)[0].(map[string]any)["clientId"] != "p19" {
		t.Fatalf("debe contar solo el más antiguo: %v", out)
	}
}

func TestErrorsAndCascade(t *testing.T) {
	a := newAPI(t)
	ev, se := a.fixture()
	missing := bson.NewObjectID().Hex()
	a.do("GET", "/events/xyz", nil, 400)
	a.do("GET", "/events/"+missing, nil, 404)
	a.do("DELETE", "/sessions/"+missing, nil, 404)
	a.do("POST", "/events", `{"name":"x"}`, 400)
	a.do("PATCH", "/events/"+ev+"/active", `{}`, 400)
	a.do("GET", "/events/"+ev+"/checkins?page=0", nil, 400)
	a.do("GET", "/auth/me", nil, 200)

	at := "2026-11-25T12:00:00Z"
	got := a.send(ev, missing, [3]string{"m", "A|1|a", at})
	got = append(got, a.send(missing, se, [3]string{"n", "A|1|a", at})...)
	got = append(got, a.send(ev, se, [3]string{"o", "A|1|a", "ayer"}, [3]string{"p", "A|1|a", at})...)
	if want := "error error error created"; strings.Join(got, " ") != want {
		t.Fatalf("statuses = %v", got)
	}

	a.do("PATCH", "/events/"+ev+"/active", `{"active":false}`, 200)
	if w := a.raw("GET", "/device/events", nil); strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("evento inactivo visible: %s", w.Body)
	}
	a.do("DELETE", "/sessions/"+se, nil, 204)
	if out := a.do("GET", "/events/"+ev+"/checkins", nil, 200); out["total"].(float64) != 0 {
		t.Fatalf("checkins no borrados: %v", out)
	}
	a.do("DELETE", "/events/"+ev, nil, 204)
	a.do("GET", "/events/"+ev, nil, 404)
}
