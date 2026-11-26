package export

import (
	"bytes"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/uct/autocheckin/backend/internal/models"
)

func TestWrite(t *testing.T) {
	loc, err := time.LoadLocation("America/Santiago")
	if err != nil {
		t.Skip("sin tzdata:", err)
	}
	s1 := models.Session{ID: bson.NewObjectID(), Name: "Apertura", Room: "A1"}
	s2 := models.Session{ID: bson.NewObjectID(), Name: "Cierre"}
	at := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC) // 09:00 en Santiago
	mk := func(s models.Session, d time.Duration, dup bool) models.Checkin {
		return models.Checkin{SessionID: s.ID, AttendeeKey: "1", ScannedAt: at.Add(d), Duplicate: dup,
			Attendee: models.Attendee{Name: "=Ana", RUT: "1", Extra: []string{"x", "y"}}, Raw: "=Ana|1"}
	}
	var buf bytes.Buffer
	err = Write(&buf, []models.Session{s1, s2}, []models.Checkin{mk(s1, time.Minute, true), mk(s1, 0, false)}, loc)
	if err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(&buf)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	for cell, want := range map[string]string{
		"A2": "=Ana", "D2": "1", "E1": "Apertura — A1", "F1": "Cierre",
		"E2": "25-11-2026 09:00:00", "F2": "", "A3": "",
	} {
		if got, _ := f.GetCellValue(SheetSummary, cell); got != want {
			t.Errorf("%s!%s = %q, want %q", SheetSummary, cell, got, want)
		}
	}
	if formula, _ := f.GetCellFormula(SheetSummary, "A2"); formula != "" {
		t.Errorf("A2 se interpretó como fórmula: %q", formula)
	}
	for cell, want := range map[string]string{"G2": "x | y", "I2": "No", "I3": "Sí"} {
		if got, _ := f.GetCellValue(SheetRecords, cell); got != want {
			t.Errorf("%s!%s = %q, want %q", SheetRecords, cell, got, want)
		}
	}
}
