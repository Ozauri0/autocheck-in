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

cleanup() {
  if [[ -n "$EVENT_ID" && -n "$TOKEN" ]]; then
    curl -sS -m 10 -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE/events/$EVENT_ID" || true
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
ok "checkins created/duplicate/exists"

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
expect "lista con duplicados" "$(json total <<<"$OUT")" 2
ok "lista de checkins"

req 204 DELETE "/events/$EVENT_ID" "${AUTH[@]}" >/dev/null
req 404 GET "/events/$EVENT_ID" "${AUTH[@]}" >/dev/null
EVENT_ID=""
ok "evento eliminado"

echo "SMOKE OK"
