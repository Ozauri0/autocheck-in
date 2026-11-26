// Command seed carga un evento desde un archivo JSON.
//
//	seed -file seed/ecad2026.json
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"time"

	"github.com/uct/autocheckin/backend/internal/config"
	"github.com/uct/autocheckin/backend/internal/db"
	"github.com/uct/autocheckin/backend/internal/seeder"
)

func main() {
	file := flag.String("file", "", "archivo JSON del evento")
	flag.Parse()
	if *file == "" {
		log.Fatal("uso: seed -file seed/<archivo>.json")
	}
	if err := run(*file); err != nil {
		log.Fatal(err)
	}
}

func run(path string) error {
	r, err := os.Open(path)
	if err != nil {
		return err
	}
	defer r.Close()
	data, err := seeder.Parse(r)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	uri, name := config.Mongo()
	store, err := db.Connect(ctx, uri, name)
	if err != nil {
		return err
	}
	defer func() { _ = store.Close(context.Background()) }()
	if err := store.EnsureIndexes(ctx); err != nil {
		return err
	}
	res, err := seeder.Apply(ctx, store, data)
	if err != nil {
		return err
	}
	log.Printf("evento %s: %d sesiones creadas, %d actualizadas, %d eliminadas",
		res.EventID.Hex(), res.Created, res.Updated, res.Removed)
	if res.Kept > 0 {
		log.Printf("aviso: %d sesiones ausentes del archivo se conservaron porque tienen check-ins", res.Kept)
	}
	return nil
}
