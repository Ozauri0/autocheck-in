# Contrato API — autocheck-in (UCT)

Fuente de verdad compartida por `backend/` (Go), `web/` (Next.js) y `mobile/` (Expo). No cambiar sin actualizar los tres.

Base: `{API_URL}/api/v1` · JSON · fechas ISO-8601 (RFC3339, con zona). Zona de negocio: `America/Santiago`.
Errores: `{ "error": "<mensaje>" }` con status HTTP apropiado (400/401/404/409/500).

## Autenticación
- **Admin (web)**: `POST /auth/login` → JWT HS256 (`JWT_SECRET`, exp 12h). Header `Authorization: Bearer <token>`.
  Admin inicial se crea al arrancar si no existe, desde env `ADMIN_EMAIL` / `ADMIN_PASSWORD` (bcrypt).
- **Dispositivo (app)**: header `X-Device-Key: <DEVICE_API_KEY>` (clave compartida, env del backend; se configura en Ajustes de la app).

## Formato del QR
Texto plano separado por `|`: `nombre|rut|email[|extra...]`. Ej: `Daniela contreras|13816473|cferrer2021@alu.uct.cl`.
Parseo (idéntico en Go y TS): `split("|")`, `trim` de cada parte; `[0]=name`, `[1]=rut`, `[2]=email`, resto → `extra[]`.
Si no hay `|` → `name = raw` y el resto vacío. **No se valida**; `raw` siempre se guarda.
**attendeeKey** (para duplicados) = `rut` normalizado (sin puntos/guión/espacios, minúsculas) si existe; si no `email` en minúsculas; si no `raw` trim minúsculas.

## Modelos (MongoDB, colecciones)
```
events   { _id, name, description, location, startDate, endDate, active: bool, createdAt, updatedAt }
sessions { _id, eventId, name, room, startsAt, endsAt, order: int, createdAt, updatedAt }
checkins { _id, clientId (uuid generado en el dispositivo, ÚNICO), eventId, sessionId,
           deviceId, deviceName, raw,
           attendee: { name, rut, email, extra: [string] }, attendeeKey,
           scannedAt (hora del dispositivo), receivedAt (hora servidor), duplicate: bool }
admins   { _id, email (único), name, passwordHash, createdAt }
```
Índices: `checkins.clientId` único; `checkins {sessionId, attendeeKey}`; `checkins.eventId`; `sessions.eventId`.

Representación JSON: `_id` se expone como `id` (string hex). Fechas RFC3339.

## Regla de duplicados
"Solo el primero cuenta": un check-in es `duplicate=true` si ya existe otro en la **misma sesión** con el mismo `attendeeKey` y `scannedAt` anterior o igual. Todos los escaneos se guardan; el consolidado y los contadores cuentan solo `duplicate=false`.
Reenvío del mismo `clientId` es idempotente (status `exists`, no crea nada).

## Endpoints

### Público
- `GET /health` → `{ "status": "ok" }`

### Auth
- `POST /auth/login` `{email, password}` → `200 {token, admin:{id,email,name}}` · `401`
- `GET /auth/me` (Bearer) → `{id,email,name}`

### Admin (Bearer)
- `GET /events?includeInactive=true|false` (default true) → `[Event & {sessionCount, checkinCount}]` orden `startDate desc`
- `POST /events` `{name, description?, location?, startDate, endDate, active?=true}` → `201 Event`
- `GET /events/{id}` → `Event & {sessions:[Session] (orden startsAt, order)}`
- `PUT /events/{id}` `{name, description, location, startDate, endDate, active}` → `Event`
- `PATCH /events/{id}/active` `{active: bool}` → `Event`
- `DELETE /events/{id}` → `204` (borra en cascada sesiones y checkins)
- `POST /events/{id}/sessions` `{name, room?, startsAt, endsAt, order?}` → `201 Session`
- `PUT /sessions/{id}` `{name, room, startsAt, endsAt, order}` → `Session`
- `DELETE /sessions/{id}` → `204` (borra sus checkins)
- `GET /events/{id}/checkins?sessionId=&q=&includeDuplicates=false&page=1&limit=50`
  → `{items:[Checkin & {sessionName}], total, page, limit}` (q busca en name/rut/email, case-insensitive; orden scannedAt desc)
- `GET /events/{id}/stats` → `{ totalCheckins, uniqueAttendees, sessions:[{sessionId, name, room, count}] }` (totalCheckins y count excluyen duplicados)
- `GET /events/{id}/export.xlsx?sessionId=` → archivo `.xlsx` (`Content-Disposition: attachment`):
  - Hoja **"Consolidado"**: una fila por attendeeKey del evento: Nombre, RUT, Email, Total sesiones asistidas, y una columna por sesión (`Sesión — Sala`) con la hora del primer check-in o vacío.
  - Hoja **"Registros"**: todos los check-ins (incl. duplicados): Fecha/hora escaneo, Sesión, Sala, Nombre, RUT, Email, Extra, Dispositivo, Duplicado (Sí/No), Raw.
  - Horas en `America/Santiago`.

### Dispositivo (X-Device-Key)
- `GET /device/events` → `[Event & {sessions:[Session]}]` solo `active=true`, orden `startDate asc`
- `POST /device/checkins` `{checkins:[{clientId, eventId, sessionId, deviceId, deviceName, raw, scannedAt}]}` (máx 500)
  → `200 {results:[{clientId, status:"created"|"duplicate"|"exists"|"error", duplicate: bool, message?}]}`
  (`status:"duplicate"` = se guardó pero marcado duplicado; `exists` = clientId ya recibido, `duplicate` indica su marca actual;
  `error` p.ej. sesión inexistente o `raw` vacío/>4096 bytes). El backend re-parsea `raw`. Un fallo de BD devuelve 500 (reintentar el lote).

## Config backend (env)
`PORT=8080`, `MONGO_URI=mongodb://mongo:27017`, `MONGO_DB=autocheckin`, `JWT_SECRET`, `DEVICE_API_KEY`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGINS=http://localhost:3000`, `TZ_NAME=America/Santiago`.
