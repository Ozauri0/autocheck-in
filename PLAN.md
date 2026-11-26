# PLAN — autocheck-in UCT

Contrato: [docs/API.md](docs/API.md). Monorepo: `backend/` (Go + MongoDB), `web/` (Next.js), `mobile/` (Expo RN Android).
Decisiones: Evento → Sesiones (cada tablet elige evento + sesión; N tablets por sesión) · duplicados: solo el primero cuenta · login admin JWT + `X-Device-Key` para la app · Expo dev build. Go no está instalado en el host → se usa Docker (`golang` image).

| # | Tarea | Nivel | Deps | Verificación | Estado |
|---|---|---|---|---|---|
| 1 | Backend Go: API completa + docker-compose (mongo+api) + seed loader + tests | M (Sonnet) | — | `docker run --rm -v $PWD/backend:/src -w /src golang:1.25 sh -c "go vet ./... && go test ./..."` + `docker compose up -d --build && bash scripts/smoke.sh` | pendiente |
| 2 | Web Next.js admin: login, CRUD eventos/sesiones, asistentes, descarga xlsx | M (Sonnet) | contrato | `cd web && npm run lint && npm run build` | pendiente |
| 3 | Mobile Expo: eventos→sesión→escáner (cámara frontal/trasera), Excel local, cola offline + sync | M (Sonnet) | contrato | `cd mobile && npx tsc --noEmit && npx jest && npx expo export --platform android` | pendiente |
| 4 | Seed ECAD 2026 (`backend/seed/ecad2026.json`) desde el PDF | S0 (Gemini Flash) | — | `python3 -c "import json;d=json.load(open('backend/seed/ecad2026.json'));assert len(d['sessions'])>=25"` | pendiente |
| 5 | Merge ramas + integración E2E (compose + web contra API + smoke device) | yo | 1-4 | `scripts/smoke.sh` y `web` build | pendiente |
| 6 | Revisión cruzada backend/auth (Gemini Flash high) | S1+ | 1-3 | hallazgos resueltos | pendiente |
