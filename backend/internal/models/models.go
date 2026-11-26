// Package models define los documentos MongoDB y su representación JSON.
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Event struct {
	ID          bson.ObjectID `bson:"_id" json:"id"`
	Name        string        `bson:"name" json:"name"`
	Description string        `bson:"description" json:"description"`
	Location    string        `bson:"location" json:"location"`
	StartDate   time.Time     `bson:"startDate" json:"startDate"`
	EndDate     time.Time     `bson:"endDate" json:"endDate"`
	Active      bool          `bson:"active" json:"active"`
	CreatedAt   time.Time     `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time     `bson:"updatedAt" json:"updatedAt"`
}

type Session struct {
	ID        bson.ObjectID `bson:"_id" json:"id"`
	EventID   bson.ObjectID `bson:"eventId" json:"eventId"`
	Name      string        `bson:"name" json:"name"`
	Room      string        `bson:"room" json:"room"`
	StartsAt  time.Time     `bson:"startsAt" json:"startsAt"`
	EndsAt    time.Time     `bson:"endsAt" json:"endsAt"`
	Order     int           `bson:"order" json:"order"`
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time     `bson:"updatedAt" json:"updatedAt"`
}

type Attendee struct {
	Name  string   `bson:"name" json:"name"`
	RUT   string   `bson:"rut" json:"rut"`
	Email string   `bson:"email" json:"email"`
	Extra []string `bson:"extra" json:"extra"`
}

type Checkin struct {
	ID          bson.ObjectID `bson:"_id" json:"id"`
	ClientID    string        `bson:"clientId" json:"clientId"`
	EventID     bson.ObjectID `bson:"eventId" json:"eventId"`
	SessionID   bson.ObjectID `bson:"sessionId" json:"sessionId"`
	DeviceID    string        `bson:"deviceId" json:"deviceId"`
	DeviceName  string        `bson:"deviceName" json:"deviceName"`
	Raw         string        `bson:"raw" json:"raw"`
	Attendee    Attendee      `bson:"attendee" json:"attendee"`
	AttendeeKey string        `bson:"attendeeKey" json:"attendeeKey"`
	ScannedAt   time.Time     `bson:"scannedAt" json:"scannedAt"`
	ReceivedAt  time.Time     `bson:"receivedAt" json:"receivedAt"`
	Duplicate   bool          `bson:"duplicate" json:"duplicate"`
}

type Admin struct {
	ID           bson.ObjectID `bson:"_id" json:"id"`
	Email        string        `bson:"email" json:"email"`
	Name         string        `bson:"name" json:"name"`
	PasswordHash string        `bson:"passwordHash" json:"-"`
	CreatedAt    time.Time     `bson:"createdAt" json:"-"`
}

// Now devuelve la hora actual en UTC con la precisión que guarda MongoDB (ms).
func Now() time.Time { return time.Now().UTC().Truncate(time.Millisecond) }
