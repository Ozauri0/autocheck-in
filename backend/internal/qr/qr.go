// Package qr interpreta el contenido de los QR según docs/API.md.
// La lógica debe mantenerse idéntica a la implementación TypeScript.
package qr

import (
	"strings"
	"unicode"

	"github.com/uct/autocheckin/backend/internal/models"
)

// isSpace equivale a los espacios que reconoce JavaScript (incluye BOM).
func isSpace(r rune) bool { return unicode.IsSpace(r) || r == 0xFEFF }

func trim(s string) string { return strings.TrimFunc(s, isSpace) }

// Parse separa `nombre|rut|email[|extra...]`. Sin `|`, name = raw.
func Parse(raw string) models.Attendee {
	a := models.Attendee{Extra: []string{}}
	if !strings.Contains(raw, "|") {
		a.Name = raw
		return a
	}
	parts := strings.Split(raw, "|")
	for i := range parts {
		parts[i] = trim(parts[i])
	}
	a.Name = parts[0]
	a.RUT = parts[1]
	if len(parts) > 2 {
		a.Email = parts[2]
	}
	if len(parts) > 3 {
		a.Extra = append(a.Extra, parts[3:]...)
	}
	return a
}

// AttendeeKey identifica a un asistente: rut normalizado, o email, o raw.
func AttendeeKey(a models.Attendee, raw string) string {
	rut := strings.Map(func(r rune) rune {
		if r == '.' || r == '-' || isSpace(r) {
			return -1
		}
		return r
	}, a.RUT)
	if rut != "" {
		return strings.ToLower(rut)
	}
	if email := trim(a.Email); email != "" {
		return strings.ToLower(email)
	}
	return strings.ToLower(trim(raw))
}
