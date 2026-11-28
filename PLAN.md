# PLAN — autocheck-in UCT

Contrato: [docs/API.md](docs/API.md). Monorepo: `backend/` (Go + MongoDB), `web/` (Next.js), `mobile/` (Expo RN Android).
Decisiones: Evento → Sesiones (cada tablet elige evento + sesión; N tablets por sesión) · duplicados: solo el primero cuenta · login admin JWT + `X-Device-Key` para la app · Expo dev build. Go no está instalado en el host → se usa Docker (`golang` image).

| # | Tarea | Nivel | Deps | Verificación | Estado |
|---|---|---|---|---|---|
| 1 | Backend Go: API completa + docker-compose (mongo+api) + seed loader + tests | M (Sonnet) | — | `docker run --rm -v $PWD/backend:/src -w /src golang:1.25 sh -c "go vet ./... && go test ./..."` + `docker compose up -d --build && bash scripts/smoke.sh` | hecho (254ef89, smoke OK) |
| 2 | Web Next.js admin: login, CRUD eventos/sesiones, asistentes, descarga xlsx | M (Sonnet) | contrato | `cd web && bun run lint && bun run build` | hecho (9ab2875, lint+build OK) |
| 3 | Mobile Expo: eventos→sesión→escáner (cámara frontal/trasera), Excel local, cola offline + sync | M (Sonnet) | contrato | `cd mobile && bunx tsc --noEmit && bun run test && bunx expo export --platform android` | hecho (3f98fb4, sin probar en dispositivo) |
| 4 | Seed ECAD 2026 (`backend/seed/ecad2026.json`) desde el PDF | S0 (Gemini Flash) | — | `python3 -c "import json;d=json.load(open('backend/seed/ecad2026.json'));assert len(d['sessions'])>=25"` | hecho (65737b0, 35 sesiones) |
| 5 | Merge ramas + integración E2E (compose + web contra API + smoke device) | yo | 1-4 | `scripts/smoke.sh` y `web` build | hecho (0b1a36e, E2E OK sin bugs) |
| 6 | Revisión cruzada backend/auth (Gemini Flash high) | S1+ | 1-3 | hallazgos resueltos | hecho (6 hallazgos menores, 5 corregidos en 262c804) |
| 7 | Escáner QR web en el panel (staff, login admin) + /device/checkins acepta Bearer admin + HTTPS (Caddy) en compose | M (Sonnet) | 1-2 | `cd web && bun run lint && bun run build` + go test + smoke | hecho (00eb7b0, Playwright OK; falta celular real) |
| 8 | Roles admin/ayudante + CRUD usuarios + copiar evento + cartel 2 s (backend + web) | M (Sonnet) | 7 | go test + smoke + `cd web && bun run lint && bun run build` + navegador | hecho (bbf1c69) |
| 9 | App: cartel de escaneo se cierra solo a los 2 s | S1 (Haiku) | — | `cd mobile && bunx tsc --noEmit && bun run test` | hecho (ad0a889, 27 tests) |

## Pendiente (fuera de este plan)
- Probar la app en una tablet/teléfono Android real (dev build): cámara frontal/trasera, Excel local, compartir, cola offline. No hay `adb` en este equipo.
- Limpiar los check-ins de prueba del evento ECAD 2026 (o recargar Mongo) antes del evento real.
- Cambiar `JWT_SECRET`, `DEVICE_API_KEY` y `ADMIN_PASSWORD` de dev antes de desplegar.
- La API debe correr en una sola instancia (lock en memoria para duplicados).
