// Package config lee la configuración del backend desde variables de entorno.
package config

import (
	"errors"
	"os"
	"strings"
	"time"
	_ "time/tzdata" // zonas horarias embebidas (imagen mínima)
)

type Config struct {
	Port          string
	MongoURI      string
	MongoDB       string
	JWTSecret     string
	DeviceAPIKey  string
	AdminEmail    string
	AdminPassword string
	CORSOrigins   []string
	Location      *time.Location
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Mongo devuelve solo la conexión a la base (lo usa también cmd/seed).
func Mongo() (uri, name string) {
	return env("MONGO_URI", "mongodb://mongo:27017"), env("MONGO_DB", "autocheckin")
}

// Load carga la configuración completa de la API.
func Load() (Config, error) {
	c := Config{
		Port:          env("PORT", "8080"),
		JWTSecret:     os.Getenv("JWT_SECRET"),
		DeviceAPIKey:  os.Getenv("DEVICE_API_KEY"),
		AdminEmail:    os.Getenv("ADMIN_EMAIL"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
	}
	c.MongoURI, c.MongoDB = Mongo()
	for _, o := range strings.Split(env("CORS_ORIGINS", "http://localhost:3000"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.CORSOrigins = append(c.CORSOrigins, o)
		}
	}
	if c.JWTSecret == "" || c.DeviceAPIKey == "" {
		return c, errors.New("JWT_SECRET y DEVICE_API_KEY son obligatorios")
	}
	loc, err := time.LoadLocation(env("TZ_NAME", "America/Santiago"))
	if err != nil {
		return c, err
	}
	c.Location = loc
	return c, nil
}
