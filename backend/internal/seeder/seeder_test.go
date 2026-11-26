package seeder

import (
	"context"
	"os"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/uct/autocheckin/backend/internal/db"
)

func example(t *testing.T) File {
	t.Helper()
	r, err := os.Open("../../seed/example.json")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	f, err := Parse(r)
	if err != nil {
		t.Fatal(err)
	}
	return f
}

func TestParse(t *testing.T) {
	if f := example(t); len(f.Sessions) != 2 {
		t.Fatalf("sesiones = %d", len(f.Sessions))
	}
	for _, bad := range []string{`{`, `{"event":{"name":"x"}}`} {
		if _, err := Parse(strings.NewReader(bad)); err == nil {
			t.Errorf("se aceptó %q", bad)
		}
	}
}

func TestApplyIdempotent(t *testing.T) {
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
	f := example(t)
	first, err := Apply(ctx, store, f)
	if err != nil || first.Created != 2 {
		t.Fatalf("%+v %v", first, err)
	}
	again, err := Apply(ctx, store, f)
	if err != nil || again.Updated != 2 || again.Created != 0 || again.EventID != first.EventID {
		t.Fatalf("%+v %v", again, err)
	}
	// Una sesión con check-ins que desaparece del archivo se conserva.
	var s struct {
		ID bson.ObjectID `bson:"_id"`
	}
	if err := store.Sessions.FindOne(ctx, bson.M{"name": f.Sessions[0].Name}).Decode(&s); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Checkins.InsertOne(ctx, bson.M{"clientId": "x", "sessionId": s.ID}); err != nil {
		t.Fatal(err)
	}
	f.Sessions = nil
	res, err := Apply(ctx, store, f)
	if err != nil || res.Kept != 1 || res.Removed != 1 {
		t.Fatalf("%+v %v", res, err)
	}
}
