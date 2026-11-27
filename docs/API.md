# Contrato API — autocheck-in (UCT)

Fuente de verdad compartida por `backend/` (Go), `web/` (Next.js) y `mobile/` (Expo). No cambiar sin actualizar los tres.

Base: `{API_URL}/api/v1` · JSON · fechas ISO-8601 (RFC3339, con zona). Zona de negocio: `America/Santiago`.
Errores: `{ "error": "<mensaje>" }` con status HTTP apropiado (400/401/403/404/409/500).

## Autenticación
- **Usuarios (web)**: `POST /auth/login` → JWT HS256 (`JWT_SECRET`, exp 12h). Header `Authorization: Bearer <token>`.
  Admin inicial se crea al arrancar si no existe, desde env `ADMIN_EMAIL` / `ADMIN_PASSWORD` (bcrypt), con rol `admin`.
- **Dispositivo (app)**: header `X-Device-Key: <DEVICE_API_KEY>` (clave compartida, env del backend; se configura en Ajustes de la app).
  Los endpoints `/device/*` aceptan como alternativa `Authorization: Bearer <JWT>` de cualquier usuario (escáner web del panel, vía BFF). Basta una de las dos credenciales; sin ninguna válida → `401`.

## Roles
| Rol | Puede |
|---|---|
| `admin` | todo: eventos, sesiones, asistentes, export, estadísticas, usuarios y escaneo |
| `ayudante` | solo `GET /auth/me`, `GET /device/events` y `POST /device/checkins` |

- Con un ayudante, cualquier endpoint de admin responde `403`.
- El rol no va en el JWT: se consulta en la base en cada petición. Cambiar el rol surte efecto de inmediato y un usuario eliminado recibe `401`.
- `X-Device-Key` solo sirve en `/device/*`.
- Los usuarios anteriores a los roles (sin `role`) son `admin`; al arrancar la API se les guarda ese valor.

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
admins   { _id, email (único), name, role: "admin"|"ayudante", passwordHash, createdAt }   # usuarios
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
- `POST /auth/login` `{email, password}` → `200 {token, admin:{id,email,name,role}}` · `401` (la clave `admin` es el usuario, sea cual sea su rol)
- `GET /auth/me` (Bearer, cualquier rol) → `{id,email,name,role}`

### Admin (Bearer de un usuario `admin`)
- `GET /events?includeInactive=true|false` (default true) → `[Event & {sessionCount, checkinCount}]` orden `startDate desc`
- `POST /events` `{name, description?, location?, startDate, endDate, active?=true}` → `201 Event`
- `GET /events/{id}` → `Event & {sessions:[Session] (orden startsAt, order)}`
- `PUT /events/{id}` `{name, description, location, startDate, endDate, active}` → `Event`
- `PATCH /events/{id}/active` `{active: bool}` → `Event`
- `DELETE /events/{id}` → `204` (borra en cascada sesiones y checkins)
- `POST /events/{id}/copy` `{name?, startDate?}` (cuerpo opcional) → `201 Event` nuevo con las sesiones copiadas, sin check-ins y `active:false`.
  `name` por defecto `"<nombre> (copia)"`. Con `startDate`, el evento y todas sus sesiones se desplazan la misma duración (`startDate - startDate original`); sin él se conservan las fechas.
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

### Usuarios (Bearer de un usuario `admin`)
`User = {id, email, name, role}` (la contraseña y su hash nunca se devuelven).
- `GET /users` → `[User]` orden por `name`, `email`
- `POST /users` `{email, name, password, role}` → `201 User`
- `PUT /users/{id}` `{email, name, role, password?}` → `User` (`password` ausente o vacío = no cambiarla)
- `DELETE /users/{id}` → `204`
- `400`: email sin `@`, nombre vacío, rol desconocido, contraseña de menos de 4 caracteres o de más de 72 bytes.
- `409`: email ya usado (se guarda en minúsculas); eliminarse a sí mismo o quitarse el rol `admin`; dejar el sistema sin ningún admin.

### Dispositivo (X-Device-Key o Bearer de cualquier usuario)
- `GET /device/events` → `[Event & {sessions:[Session]}]` solo `active=true`, orden `startDate asc`
- `POST /device/checkins` `{checkins:[{clientId, eventId, sessionId, deviceId, deviceName, raw, scannedAt}]}` (máx 500)
  → `200 {results:[{clientId, status:"created"|"duplicate"|"exists"|"error", duplicate: bool, message?}]}`
  (`status:"duplicate"` = se guardó pero marcado duplicado; `exists` = clientId ya recibido, `duplicate` indica su marca actual;
  `error` p.ej. sesión inexistente o `raw` vacío/>4096 bytes). El backend re-parsea `raw`. Un fallo de BD devuelve 500 (reintentar el lote).

## Config backend (env)
`PORT=8080`, `MONGO_URI=mongodb://mongo:27017`, `MONGO_DB=autocheckin`, `JWT_SECRET`, `DEVICE_API_KEY`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGINS=http://localhost:3000`, `TZ_NAME=America/Santiago`.
