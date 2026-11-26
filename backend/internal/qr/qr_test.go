package qr

import (
	"reflect"
	"testing"

	"github.com/uct/autocheckin/backend/internal/models"
)

func att(name, rut, email string, extra ...string) models.Attendee {
	return models.Attendee{Name: name, RUT: rut, Email: email, Extra: append([]string{}, extra...)}
}

func TestParseAndAttendeeKey(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want models.Attendee
		key  string
	}{
		{"ejemplo del contrato", "Daniela contreras|13816473|cferrer2021@alu.uct.cl",
			att("Daniela contreras", "13816473", "cferrer2021@alu.uct.cl"), "13816473"},
		{"trim y extra", "  Ana | 1-9 | a@uct.cl | x |y ", att("Ana", "1-9", "a@uct.cl", "x", "y"), "19"},
		{"rut con puntos y guion", "Ana|13.816.473-K|a@uct.cl", att("Ana", "13.816.473-K", "a@uct.cl"), "13816473k"},
		{"rut con espacios", "Ana| 13 816 473 - k |", att("Ana", "13 816 473 - k", ""), "13816473k"},
		{"sin rut usa email", "Ana||Ana.Perez@UCT.cl", att("Ana", "", "Ana.Perez@UCT.cl"), "ana.perez@uct.cl"},
		{"rut solo separadores usa email", "Ana|.-|A@uct.cl", att("Ana", ".-", "A@uct.cl"), "a@uct.cl"},
		{"sin rut ni email usa raw", "  Ana|| ", att("Ana", "", ""), "ana||"},
		{"dos partes", "Ana|123", att("Ana", "123", ""), "123"},
		{"sin separador", "  Texto Libre ", att("  Texto Libre ", "", ""), "texto libre"},
		{"extra vacio se conserva", "A|1|b|", att("A", "1", "b", ""), "1"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Parse(tc.raw)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("Parse(%q) = %#v, want %#v", tc.raw, got, tc.want)
			}
			if key := AttendeeKey(got, tc.raw); key != tc.key {
				t.Fatalf("AttendeeKey = %q, want %q", key, tc.key)
			}
		})
	}
}
