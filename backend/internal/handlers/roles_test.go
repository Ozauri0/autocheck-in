package handlers

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// as devuelve un cliente autenticado como el usuario indicado.
func (a *api) as(email, password string) *api {
	a.t.Helper()
	out := a.do("POST", "/auth/login", map[string]string{"email": email, "password": password}, 200)
	return &api{t: a.t, h: a.h, token: out["token"].(string)}
}

func (a *api) newUser(email, role string) string {
	a.t.Helper()
	u := a.do("POST", "/users", map[string]string{"email": email, "name": "U", "password": "1234", "role": role}, 201)
	return u["id"].(string)
}

func TestRoles(t *testing.T) {
	a := newAPI(t)
	ev, se := a.fixture()
	id := a.newUser("ayu@uct.cl", "ayudante")
	h := a.as("ayu@uct.cl", "1234")
	if me := h.do("GET", "/auth/me", nil, 200); me["role"] != "ayudante" {
		t.Fatalf("me: %v", me)
	}
	// Solo Bearer, sin la device key que añade api.raw.
	only := func(c *api, method, path, body string, want int) {
		t.Helper()
		r := httptest.NewRequest(method, "/api/v1"+path, strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer "+c.token)
		w := httptest.NewRecorder()
		c.h.ServeHTTP(w, r)
		if w.Code != want {
			t.Errorf("%s %s: status %d, want %d: %s", method, path, w.Code, want, w.Body)
		}
	}
	admin := [][2]string{
		{"GET", "/events"}, {"POST", "/events"}, {"GET", "/events/" + ev}, {"PUT", "/events/" + ev},
		{"PATCH", "/events/" + ev + "/active"}, {"DELETE", "/events/" + ev}, {"POST", "/events/" + ev + "/copy"},
		{"POST", "/events/" + ev + "/sessions"}, {"PUT", "/sessions/" + se}, {"DELETE", "/sessions/" + se},
		{"GET", "/events/" + ev + "/checkins"}, {"GET", "/events/" + ev + "/stats"},
		{"GET", "/events/" + ev + "/export.xlsx"},
		{"GET", "/users"}, {"POST", "/users"}, {"PUT", "/users/" + id}, {"DELETE", "/users/" + id},
	}
	for _, route := range admin {
		only(h, route[0], route[1], "{}", 403)
		// La device key (con o sin Bearer de ayudante) no da permisos de admin.
		if w := h.raw(route[0], route[1], "{}"); w.Code != 403 {
			t.Errorf("%v con device key: %d", route, w.Code)
		}
		only(&api{t: t, h: a.h}, route[0], route[1], "{}", 401)
	}
	only(h, "GET", "/device/events", "", 200)
	only(h, "POST", "/device/checkins", `{"checkins":[]}`, 200)
	only(a, "GET", "/device/events", "", 200)
	only(a, "GET", "/users", "", 200)

	// El cambio de rol y el borrado surten efecto sin volver a iniciar sesión.
	a.do("PUT", "/users/"+id, map[string]string{"email": "ayu@uct.cl", "name": "U", "role": "admin"}, 200)
	only(h, "GET", "/events", "", 200)
	a.do("PUT", "/users/"+id, map[string]string{"email": "ayu@uct.cl", "name": "U", "role": "ayudante"}, 200)
	only(h, "GET", "/events", "", 403)
	a.do("DELETE", "/users/"+id, nil, 204)
	only(h, "GET", "/auth/me", "", 401)
	only(h, "GET", "/device/events", "", 401)
}

func TestUsersCRUD(t *testing.T) {
	a := newAPI(t)
	me := a.do("GET", "/auth/me", nil, 200)
	self := me["id"].(string)
	if me["role"] != "admin" {
		t.Fatalf("admin inicial: %v", me)
	}
	valid := map[string]string{"email": " Otra@UCT.cl ", "name": "Otra", "password": "1234", "role": "ayudante"}
	u := a.do("POST", "/users", valid, 201)
	id := u["id"].(string)
	if u["email"] != "otra@uct.cl" || u["role"] != "ayudante" || u["passwordHash"] != nil {
		t.Fatalf("creado: %v", u)
	}
	a.do("POST", "/users", valid, 409)
	for field, value := range map[string]string{"email": "x", "name": " ", "password": "123", "role": "root"} {
		bad := map[string]string{"email": "n@uct.cl", "name": "N", "password": "1234", "role": "admin"}
		bad[field] = value
		a.do("POST", "/users", bad, 400)
	}
	list := a.raw("GET", "/users", nil).Body.String()
	var users []map[string]any
	if err := json.Unmarshal([]byte(list), &users); err != nil || len(users) != 2 || strings.Contains(list, "password") {
		t.Fatalf("listado: %s", list)
	}

	// Sin password se conserva la anterior; con password se cambia.
	a.do("PUT", "/users/"+id, map[string]string{"email": "otra@uct.cl", "name": "Nueva", "role": "ayudante"}, 200)
	a.as("otra@uct.cl", "1234")
	a.do("PUT", "/users/"+id, map[string]string{"email": "otra@uct.cl", "name": "Nueva", "role": "ayudante", "password": "123"}, 400)
	a.do("PUT", "/users/"+id, map[string]string{"email": "otra@uct.cl", "name": "Nueva", "role": "ayudante", "password": "abcd"}, 200)
	a.do("POST", "/auth/login", map[string]string{"email": "otra@uct.cl", "password": "1234"}, 401)
	a.as("otra@uct.cl", "abcd")
	a.do("PUT", "/users/"+id, map[string]string{"email": "admin@uct.cl", "name": "N", "role": "ayudante"}, 409)
	missing := bson.NewObjectID().Hex()
	a.do("PUT", "/users/"+missing, map[string]string{"email": "z@uct.cl", "name": "N", "role": "admin"}, 404)
	a.do("DELETE", "/users/"+missing, nil, 404)

	// Protecciones sobre el propio usuario.
	a.do("DELETE", "/users/"+self, nil, 409)
	a.do("PUT", "/users/"+self, map[string]string{"email": "admin@uct.cl", "name": "A", "role": "ayudante"}, 409)
	a.do("PUT", "/users/"+self, map[string]string{"email": "admin@uct.cl", "name": "A", "role": "admin"}, 200)
	a.do("DELETE", "/users/"+id, nil, 204)
}

// Dos admins que se eliminan a la vez: nunca puede quedar el sistema sin admin.
func TestAlwaysOneAdmin(t *testing.T) {
	a := newAPI(t)
	self := a.do("GET", "/auth/me", nil, 200)["id"].(string)
	other := a.newUser("dos@uct.cl", "admin")
	b := a.as("dos@uct.cl", "1234")
	for range 10 {
		done := make(chan int)
		go func() { done <- a.raw("DELETE", "/users/"+other, nil).Code }()
		go func() { done <- b.raw("DELETE", "/users/"+self, nil).Code }()
		first, second := <-done, <-done
		if first == 204 && second == 204 {
			t.Fatal("se eliminaron ambos admins")
		}
		// Restituir al que haya caído.
		if a.raw("GET", "/auth/me", nil).Code == 200 {
			other = a.newUser("dos@uct.cl", "admin")
			b = a.as("dos@uct.cl", "1234")
		} else {
			self = b.newUser("admin@uct.cl", "admin")
			a.token = b.as("admin@uct.cl", "1234").token
		}
	}
}

// Los usuarios guardados antes de los roles son admin y la migración los marca.
func TestLegacyUsersAreAdmin(t *testing.T) {
	a := newAPI(t)
	ctx := context.Background()
	store := a.store
	if _, err := store.Users.UpdateMany(ctx, bson.M{}, bson.M{"$unset": bson.M{"role": ""}}); err != nil {
		t.Fatal(err)
	}
	if me := a.do("GET", "/auth/me", nil, 200); me["role"] != "admin" {
		t.Fatalf("sin migrar: %v", me)
	}
	a.do("GET", "/events", nil, 200)
	if err := store.MigrateRoles(ctx); err != nil {
		t.Fatal(err)
	}
	n, err := store.Users.CountDocuments(ctx, bson.M{"role": "admin"})
	if err != nil || n != 1 {
		t.Fatalf("migrados %d: %v", n, err)
	}
}

func TestCopyEvent(t *testing.T) {
	a := newAPI(t)
	ev, se := a.fixture()
	a.do("POST", "/events/"+ev+"/sessions", map[string]any{
		"name": "S2", "room": "B", "order": 2,
		"startsAt": "2026-11-26T15:30:00-03:00", "endsAt": "2026-11-26T16:00:00-03:00",
	}, 201)
	a.send(ev, se, [3]string{"c", "A|1|a", "2026-11-25T12:00:00Z"})

	check := func(copied map[string]any, name, start, end string, starts ...string) {
		t.Helper()
		id := copied["id"].(string)
		if id == ev || copied["name"] != name || copied["active"] != false {
			t.Fatalf("copia: %v", copied)
		}
		same := func(got any, want string) {
			t.Helper()
			g, err := time.Parse(time.RFC3339, got.(string))
			w, _ := time.Parse(time.RFC3339, want)
			if err != nil || !g.Equal(w) {
				t.Errorf("%s: fecha %v, want %s", name, got, want)
			}
		}
		same(copied["startDate"], start)
		same(copied["endDate"], end)
		detail := a.do("GET", "/events/"+id, nil, 200)
		sessions := detail["sessions"].([]any)
		if len(sessions) != len(starts) {
			t.Fatalf("sesiones: %v", sessions)
		}
		for i, s := range sessions {
			m := s.(map[string]any)
			if m["id"] == se || m["eventId"] != id {
				t.Errorf("sesión sin id propio: %v", m)
			}
			same(m["startsAt"], starts[i])
		}
		if last := sessions[1].(map[string]any); last["room"] != "B" || last["order"].(float64) != 2 {
			t.Errorf("datos de la sesión: %v", last)
		}
		if out := a.do("GET", "/events/"+id+"/checkins?includeDuplicates=true", nil, 200); out["total"].(float64) != 0 {
			t.Errorf("la copia no debe tener check-ins: %v", out)
		}
	}

	// Sin cuerpo: mismas fechas y nombre por defecto.
	check(a.do("POST", "/events/"+ev+"/copy", nil, 201), "E (copia)",
		"2026-11-25T09:00:00-03:00", "2026-11-26T18:00:00-03:00",
		"2026-11-25T09:00:00-03:00", "2026-11-26T15:30:00-03:00")
	// Con startDate: todo se desplaza lo mismo (+10 días y +1 hora).
	check(a.do("POST", "/events/"+ev+"/copy", map[string]string{"name": "Otro", "startDate": "2026-12-05T10:00:00-03:00"}, 201), "Otro",
		"2026-12-05T10:00:00-03:00", "2026-12-06T19:00:00-03:00",
		"2026-12-05T10:00:00-03:00", "2026-12-06T16:30:00-03:00")

	// El original no cambia.
	if orig := a.do("GET", "/events/"+ev, nil, 200); orig["name"] != "E" || orig["active"] != true || len(orig["sessions"].([]any)) != 2 {
		t.Fatalf("original modificado: %v", orig)
	}
	a.do("POST", "/events/"+ev+"/copy", "{", 400)
	a.do("POST", "/events/"+ev+"/copy", `{"startDate":"mañana"}`, 400)
	a.do("POST", "/events/"+bson.NewObjectID().Hex()+"/copy", nil, 404)
	empty := a.do("POST", "/events", map[string]any{"name": "V", "startDate": "2026-11-25T09:00:00Z", "endDate": "2026-11-25T10:00:00Z"}, 201)
	a.do("POST", "/events/"+empty["id"].(string)+"/copy", nil, 201)
}
