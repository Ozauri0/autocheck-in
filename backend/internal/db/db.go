// Package db abre la conexión a MongoDB, crea índices y el admin inicial.
package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"github.com/uct/autocheckin/backend/internal/models"
)

type Store struct {
	Client   *mongo.Client
	DB       *mongo.Database
	Events   *mongo.Collection
	Sessions *mongo.Collection
	Checkins *mongo.Collection
	Admins   *mongo.Collection
}

// Connect conecta y espera (con reintentos) a que MongoDB responda.
func Connect(ctx context.Context, uri, name string) (*Store, error) {
	client, err := mongo.Connect(options.Client().ApplyURI(uri).SetServerSelectionTimeout(3 * time.Second))
	if err != nil {
		return nil, fmt.Errorf("mongo: %w", err)
	}
	for attempt := 1; ; attempt++ {
		if err = client.Ping(ctx, nil); err == nil {
			break
		}
		if attempt >= 10 || ctx.Err() != nil {
			_ = client.Disconnect(context.Background())
			return nil, fmt.Errorf("mongo no disponible: %w", err)
		}
		time.Sleep(time.Second)
	}
	d := client.Database(name)
	return &Store{
		Client:   client,
		DB:       d,
		Events:   d.Collection("events"),
		Sessions: d.Collection("sessions"),
		Checkins: d.Collection("checkins"),
		Admins:   d.Collection("admins"),
	}, nil
}

func (s *Store) Close(ctx context.Context) error { return s.Client.Disconnect(ctx) }

// EnsureIndexes crea los índices del contrato (idempotente).
func (s *Store) EnsureIndexes(ctx context.Context) error {
	unique := options.Index().SetUnique(true)
	indexes := []struct {
		c *mongo.Collection
		m []mongo.IndexModel
	}{
		{s.Checkins, []mongo.IndexModel{
			{Keys: bson.D{{Key: "clientId", Value: 1}}, Options: unique},
			{Keys: bson.D{{Key: "sessionId", Value: 1}, {Key: "attendeeKey", Value: 1}}},
			{Keys: bson.D{{Key: "eventId", Value: 1}}},
		}},
		{s.Sessions, []mongo.IndexModel{{Keys: bson.D{{Key: "eventId", Value: 1}}}}},
		{s.Admins, []mongo.IndexModel{{Keys: bson.D{{Key: "email", Value: 1}}, Options: unique}}},
	}
	for _, i := range indexes {
		if _, err := i.c.Indexes().CreateMany(ctx, i.m); err != nil {
			return fmt.Errorf("índices %s: %w", i.c.Name(), err)
		}
	}
	return nil
}

// EnsureAdmin crea el admin inicial si no existe. No modifica uno existente.
func (s *Store) EnsureAdmin(ctx context.Context, email, password string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || password == "" {
		return nil
	}
	err := s.Admins.FindOne(ctx, bson.M{"email": email}).Err()
	if err == nil {
		return nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.Admins.InsertOne(ctx, models.Admin{
		ID: bson.NewObjectID(), Email: email, Name: "Administrador",
		PasswordHash: string(hash), CreatedAt: models.Now(),
	})
	if mongo.IsDuplicateKeyError(err) {
		return nil
	}
	return err
}
