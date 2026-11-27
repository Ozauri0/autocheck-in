#!/usr/bin/env bash
# Prueba de humo end-to-end contra una API levantada.
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"
BASE="${API_URL%/}/api/v1"
DEVICE_KEY="${DEVICE_API_KEY:-dev-device-key}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@uct.cl}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin1234}"
QR='Daniela contreras|13816473|cferrer2021@alu.uct.cl'

TMP="$(mktemp -d)"
TOKEN=""
EVENT_ID=""
COPY_ID=""
HELPER_ID=""

cleanup() {
  if [[ -n "$TOKEN" ]]; then
    for path in ${COPY_ID:+"/events/$COPY_ID"} ${EVENT_ID:+"/events/$EVENT_ID"} ${HELPER_ID:+"/users/$HELPER_ID"}; do
      curl -sS -m 10 -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE$path" || true
    done
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

fail() { echo "FALLO: $*" >&2; exit 1; }
ok() { echo "ok  - $*"; }

# json <ruta.con.puntos>  (lee JSON por stdin)
json() {
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg p "$1" 'getpath($p | split(".") | map(tonumber? // .))'
  else
    python3 -c '
import json, sys
v = json.load(sys.stdin)
for k in sys.argv[1].split("."):
    v = v[int(k)] if isinstance(v, list) else v.get(k)
print(v if isinstance(v, str) else json.dumps(v))' "$1"
  fi
}

# req <status esperado> <método> <ruta> [args curl...]  -> cuerpo en stdout
req() {
  local want="$1" method="$2" path="$3" code
  shift 3
  code="$(curl -sS -m 30 -o "$TMP/body" -w '%{http_code}' -X "$method" "$@" "$BASE$path")" || fail "$method $path: sin conexión"
  [[ "$code" == "$want" ]] || fail "$method $path: status $code (esperado $want): $(head -c 500 "$TMP/body")"
  cat "$TMP/body"
}

expect() { [[ "$2" == "$3" ]] || fail "$1: '$2' (esperado '$3')"; }

for i in $(seq 1 60); do
  curl -sf -m 2 -o /dev/null "$BASE/health" && break
  [[ "$i" == 60 ]] && fail "la API no responde en $BASE"
  sleep 1
done
expect health "$(req 200 GET /health | json status)" ok
ok health

JSON=(-H 'Content-Type: application/json')
TOKEN="$(req 200 POST /auth/login "${JSON[@]}" -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | json token)"
[[ -n "$TOKEN" && "$TOKEN" != null ]] || fail "login sin token"
AUTH=(-H "Authorization: Bearer $TOKEN")
DEV=(-H "X-Device-Key: $DEVICE_KEY")
ok login

EVENT_ID="$(req 201 POST /events "${AUTH[@]}" "${JSON[@]}" \
  -d '{"name":"Smoke test","location":"UCT","startDate":"2026-11-25T09:00:00-03:00","endDate":"2026-11-25T18:00:00-03:00"}' | json id)"
ok "evento $EVENT_ID"
SESSION_ID="$(req 201 POST "/events/$EVENT_ID/sessions" "${AUTH[@]}" "${JSON[@]}" \
  -d '{"name":"Apertura","room":"A1","startsAt":"2026-11-25T09:00:00-03:00","endsAt":"2026-11-25T10:00:00-03:00","order":1}' | json id)"
ok "sesión $SESSION_ID"

req 200 GET /device/events "${DEV[@]}" | grep -q "$SESSION_ID" || fail "/device/events no incluye la sesión"
req 401 GET /device/events >/dev/null
ok "device events"

RUN="smoke-$$-$(date +%s)"
item() { # <clientId> <scannedAt>
  printf '{"clientId":"%s","eventId":"%s","sessionId":"%s","deviceId":"d1","deviceName":"Tablet smoke","raw":"%s","scannedAt":"%s"}' \
    "$1" "$EVENT_ID" "$SESSION_ID" "$QR" "$2"
}
OUT="$(req 200 POST /device/checkins "${DEV[@]}" "${JSON[@]}" \
  -d "{\"checkins\":[$(item "$RUN-1" 2026-11-25T09:05:00-03:00),$(item "$RUN-2" 2026-11-25T09:06:00-03:00)]}")"
expect "checkin 1" "$(json results.0.status <<<"$OUT")" created
expect "checkin 2" "$(json results.1.status <<<"$OUT")" duplicate
OUT="$(req 200 POST /device/checkins "${DEV[@]}" "${JSON[@]}" -d "{\"checkins\":[$(item "$RUN-1" 2026-11-25T09:05:00-03:00)]}")"
expect "reenvío" "$(json results.0.status <<<"$OUT")" exists
expect "reenvío no duplicado" "$(json results.0.duplicate <<<"$OUT")" false
# Escaneo offline anterior que llega tarde: pasa a ser el primero y el 1 queda duplicado.
OUT="$(req 200 POST /device/checkins "${DEV[@]}" "${JSON[@]}" -d "{\"checkins\":[$(item "$RUN-0" 2026-11-25T09:01:00-03:00)]}")"
expect "offline tardío" "$(json results.0.status <<<"$OUT")" created
OUT="$(req 200 POST /device/checkins "${DEV[@]}" "${JSON[@]}" -d "{\"checkins\":[$(item "$RUN-1" 2026-11-25T09:05:00-03:00)]}")"
expect "reenvío tras reordenar" "$(json results.0.duplicate <<<"$OUT")" true
ok "checkins created/duplicate/exists + orden offline"

OUT="$(req 200 GET "/events/$EVENT_ID/stats" "${AUTH[@]}")"
expect "stats sesión" "$(json sessions.0.count <<<"$OUT")" 1
expect "stats total" "$(json totalCheckins <<<"$OUT")" 1
expect "stats únicos" "$(json uniqueAttendees <<<"$OUT")" 1
ok stats

req 200 GET "/events/$EVENT_ID/export.xlsx" "${AUTH[@]}" >/dev/null
[[ -s "$TMP/body" ]] || fail "xlsx vacío"
[[ "$(head -c 2 "$TMP/body")" == PK ]] || fail "xlsx no empieza por PK"
ok "export.xlsx ($(wc -c <"$TMP/body") bytes)"

OUT="$(req 200 GET "/events/$EVENT_ID/checkins" "${AUTH[@]}")"
expect "lista total" "$(json total <<<"$OUT")" 1
expect "lista nombre" "$(json items.0.attendee.name <<<"$OUT")" "Daniela contreras"
OUT="$(req 200 GET "/events/$EVENT_ID/checkins?includeDuplicates=true" "${AUTH[@]}")"
expect "lista con duplicados" "$(json total <<<"$OUT")" 3
ok "lista de checkins"

# Escáner web del panel: /device/* con Bearer admin, sin device key.
req 200 GET /device/events "${AUTH[@]}" | grep -q "$SESSION_ID" || fail "/device/events con Bearer no incluye la sesión"
req 401 POST /device/checkins "${JSON[@]}" -d '{"checkins":[]}' >/dev/null
req 401 POST /device/checkins -H 'Authorization: Bearer x.y.z' "${JSON[@]}" -d '{"checkins":[]}' >/dev/null
OUT="$(req 200 POST /device/checkins "${AUTH[@]}" "${JSON[@]}" -d "{\"checkins\":[$(item "$RUN-web" 2026-11-25T09:30:00-03:00)]}")"
expect "checkin con Bearer" "$(json results.0.status <<<"$OUT")" duplicate
ok "check-in vía Bearer admin"

# Roles: un ayudante solo escanea.
HELPER_EMAIL="smoke-$$-$(date +%s)@uct.cl"
HELPER_ID="$(req 201 POST /users "${AUTH[@]}" "${JSON[@]}" \
  -d "{\"email\":\"$HELPER_EMAIL\",\"name\":\"Ayudante smoke\",\"password\":\"smoke1234\",\"role\":\"ayudante\"}" | json id)"
OUT="$(req 200 POST /auth/login "${JSON[@]}" -d "{\"email\":\"$HELPER_EMAIL\",\"password\":\"smoke1234\"}")"
expect "rol ayudante" "$(json admin.role <<<"$OUT")" ayudante
HELPER=(-H "Authorization: Bearer $(json token <<<"$OUT")")
expect "me ayudante" "$(req 200 GET /auth/me "${HELPER[@]}" | json role)" ayudante
req 200 GET /device/events "${HELPER[@]}" | grep -q "$SESSION_ID" || fail "el ayudante no ve la sesión"
OUT="$(req 200 POST /device/checkins "${HELPER[@]}" "${JSON[@]}" -d "{\"checkins\":[$(item "$RUN-ayu" 2026-11-25T09:40:00-03:00)]}")"
expect "checkin del ayudante" "$(json results.0.status <<<"$OUT")" duplicate
req 403 GET /events "${HELPER[@]}" >/dev/null
req 403 GET /users "${HELPER[@]}" >/dev/null
req 403 POST "/events/$EVENT_ID/copy" "${HELPER[@]}" >/dev/null
ok "ayudante: escanea y no administra"

# Copia con nueva fecha de inicio (+7 días): sesiones desplazadas y sin check-ins.
COPY_ID="$(req 201 POST "/events/$EVENT_ID/copy" "${AUTH[@]}" "${JSON[@]}" -d '{"startDate":"2026-12-02T09:00:00-03:00"}' | json id)"
OUT="$(req 200 GET "/events/$COPY_ID" "${AUTH[@]}")"
expect "copia nombre" "$(json name <<<"$OUT")" "Smoke test (copia)"
expect "copia inactiva" "$(json active <<<"$OUT")" false
expect "copia inicio" "$(json startDate <<<"$OUT")" 2026-12-02T12:00:00Z
expect "copia término" "$(json endDate <<<"$OUT")" 2026-12-02T21:00:00Z
expect "copia sesión inicio" "$(json sessions.0.startsAt <<<"$OUT")" 2026-12-02T12:00:00Z
expect "copia sesión término" "$(json sessions.0.endsAt <<<"$OUT")" 2026-12-02T13:00:00Z
expect "copia sin check-ins" "$(req 200 GET "/events/$COPY_ID/checkins?includeDuplicates=true" "${AUTH[@]}" | json total)" 0
ok "evento copiado con fechas desplazadas"

req 204 DELETE "/users/$HELPER_ID" "${AUTH[@]}" >/dev/null
HELPER_ID=""
req 401 GET /device/events "${HELPER[@]}" >/dev/null
req 204 DELETE "/events/$COPY_ID" "${AUTH[@]}" >/dev/null
COPY_ID=""
ok "ayudante y copia eliminados"

req 204 DELETE "/events/$EVENT_ID" "${AUTH[@]}" >/dev/null
req 404 GET "/events/$EVENT_ID" "${AUTH[@]}" >/dev/null
EVENT_ID=""
ok "evento eliminado"

echo "SMOKE OK"
