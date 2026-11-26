# Web de administración — autocheck-in UCT

Next.js (App Router) que consume la API Go según [`../docs/API.md`](../docs/API.md).

## Desarrollo

```bash
cp .env.example .env.local   # API_URL=http://localhost:8080
npm install
npm run dev                  # http://localhost:3000
npm run lint && npm run build
```

## Docker

```bash
docker build -t autocheckin-web .
docker run -p 3000:3000 -e API_URL=http://host.docker.internal:8080 autocheckin-web
```

En Linux añada `--add-host=host.docker.internal:host-gateway`.

## Notas

- Patrón BFF: el navegador nunca llama a la API Go. `API_URL` solo existe en el servidor.
- El JWT se guarda en la cookie httpOnly `session`. En producción es `Secure`: se requiere HTTPS
  (o `http://localhost`) para poder iniciar sesión.
- `/escanear`: escáner QR desde el navegador (respaldo de la app Android). La cola de pendientes
  vive en `localStorage` y se envía por `/api/scan`. La cámara exige HTTPS o `localhost`
  (ver el [README raíz](../README.md#escaneo-desde-el-navegador)).
- `src/proxy.ts` protege las rutas (en Next 16, `proxy` reemplaza a `middleware`).
- Todas las fechas se muestran e ingresan en la zona `America/Santiago`.
