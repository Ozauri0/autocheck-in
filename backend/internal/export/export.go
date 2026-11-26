// Package export genera el archivo Excel de asistencia.
package export

import (
	"io"
	"slices"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/uct/autocheckin/backend/internal/models"
)

const (
	SheetSummary = "Consolidado"
	SheetRecords = "Registros"
	timeLayout   = "02-01-2006 15:04:05"
)

type person struct {
	name, rut, email string
	times            map[string]time.Time // sessionId hex -> primer escaneo
}

func fill(dst *string, v string) {
	if *dst == "" {
		*dst = v
	}
}

// Write escribe el libro. sessions define las columnas (en ese orden).
func Write(w io.Writer, sessions []models.Session, checkins []models.Checkin, loc *time.Location) error {
	f := excelize.NewFile()
	defer f.Close()
	if err := f.SetSheetName("Sheet1", SheetSummary); err != nil {
		return err
	}
	if _, err := f.NewSheet(SheetRecords); err != nil {
		return err
	}

	sorted := slices.Clone(checkins)
	slices.SortStableFunc(sorted, func(a, b models.Checkin) int { return a.ScannedAt.Compare(b.ScannedAt) })

	people := map[string]*person{}
	order := []*person{}
	byID := map[string]models.Session{}
	for _, s := range sessions {
		byID[s.ID.Hex()] = s
	}

	records := [][]any{{"Fecha/hora escaneo", "Sesión", "Sala", "Nombre", "RUT", "Email", "Extra", "Dispositivo", "Duplicado", "Raw"}}
	for _, c := range sorted {
		s := byID[c.SessionID.Hex()]
		dup := "No"
		if c.Duplicate {
			dup = "Sí"
		}
		device := c.DeviceName
		fill(&device, c.DeviceID)
		records = append(records, []any{
			c.ScannedAt.In(loc).Format(timeLayout), s.Name, s.Room,
			c.Attendee.Name, c.Attendee.RUT, c.Attendee.Email,
			strings.Join(c.Attendee.Extra, " | "), device, dup, c.Raw,
		})

		p := people[c.AttendeeKey]
		if p == nil {
			p = &person{times: map[string]time.Time{}}
			people[c.AttendeeKey] = p
			order = append(order, p)
		}
		fill(&p.name, c.Attendee.Name)
		fill(&p.rut, c.Attendee.RUT)
		fill(&p.email, c.Attendee.Email)
		if !c.Duplicate {
			p.times[c.SessionID.Hex()] = c.ScannedAt
		}
	}

	header := []any{"Nombre", "RUT", "Email", "Total sesiones asistidas"}
	for _, s := range sessions {
		title := s.Name
		if s.Room != "" {
			title += " — " + s.Room
		}
		header = append(header, title)
	}
	summary := [][]any{header}
	slices.SortStableFunc(order, func(a, b *person) int {
		return strings.Compare(strings.ToLower(a.name), strings.ToLower(b.name))
	})
	for _, p := range order {
		row := []any{p.name, p.rut, p.email, len(p.times)}
		for _, s := range sessions {
			cell := ""
			if t, ok := p.times[s.ID.Hex()]; ok {
				cell = t.In(loc).Format(timeLayout)
			}
			row = append(row, cell)
		}
		summary = append(summary, row)
	}

	bold, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		return err
	}
	for sheet, rows := range map[string][][]any{SheetSummary: summary, SheetRecords: records} {
		for i, row := range rows {
			cell, err := excelize.CoordinatesToCellName(1, i+1)
			if err != nil {
				return err
			}
			// Los strings se guardan como texto: nunca se evalúan como fórmula.
			if err := f.SetSheetRow(sheet, cell, &row); err != nil {
				return err
			}
		}
		last, err := excelize.ColumnNumberToName(len(rows[0]))
		if err != nil {
			return err
		}
		if err := f.SetColWidth(sheet, "A", last, 24); err != nil {
			return err
		}
		if err := f.SetCellStyle(sheet, "A1", last+"1", bold); err != nil {
			return err
		}
		if err := f.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"}); err != nil {
			return err
		}
	}
	return f.Write(w)
}
