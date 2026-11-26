# Backend (Go + MongoDB)

API según [`docs/API.md`](../docs/API.md). Go no es necesario en el host: todo corre en Docker.

## Levantar

```sh
docker compose up -d --build          # desde la raíz del repo
bash scripts/smoke.sh                 # prueba end-to-end
docker compose down                   # (-v para borrar los datos)
```

Si 8080 o 27017 están ocupados:

```sh
API_PORT=8088 MONGO_PORT=27019 docker compose up -d --build
API_URL=http://localhost:8088 bash scripts/smoke.sh
```

Admin de desarrollo: `admin@uct.cl` / `admin1234`. Device key: `dev-device-key`.

## Cargar seed

```sh
docker compose exec api seed -file seed/example.json
```

Los archivos de `backend/seed/` se copian en la imagen: tras agregar uno, reconstruir con `--build`.
Es idempotente por nombre de evento. Las sesiones con igual `name`+`startsAt` conservan sus
check-ins; las que ya no estén en el archivo se eliminan salvo que tengan check-ins.

## Variables de entorno

| Variable | Default |
|---|---|
| `PORT` | `8080` |
| `MONGO_URI` | `mongodb://mongo:27017` |
| `MONGO_DB` | `autocheckin` |
| `JWT_SECRET` | obligatorio |
| `DEVICE_API_KEY` | obligatorio |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | admin inicial (solo se crea si no existe) |
| `CORS_ORIGINS` | `http://localhost:3000` (separados por coma) |
| `TZ_NAME` | `America/Santiago` |

`seed` usa solo `MONGO_URI` y `MONGO_DB`.

Los duplicados se serializan con un lock en memoria: ejecutar **una sola instancia** de la API.

## Tests

```sh
docker run --rm -v $PWD/backend:/src -v gomodcache:/go/pkg/mod -w /src golang:1.25 \
  sh -c "go vet ./... && go test ./..."
```

Los tests que requieren MongoDB se saltan si `MONGO_URI` no está definido.
