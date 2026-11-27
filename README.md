# autocheck-in UCT

Auto check-in por QR para eventos de la Universidad Católica de Temuco: tablets en la entrada de cada sala registran la asistencia y un panel web la consolida en Excel.

## Arquitectura

| Carpeta | Qué es |
|---|---|
| [`backend/`](backend/README.md) | API en Go + MongoDB |
| [`web/`](web/README.md) | Panel de administración (Next.js): eventos, sesiones, asistentes y descarga `.xlsx` |
| [`mobile/`](mobile/README.md) | App Android (Expo) que escanea y funciona sin conexión |
| [`docs/API.md`](docs/API.md) | Contrato compartido por las tres partes |

El navegador solo habla con la web, y la web con la API. La app móvil llama a la API directamente.

## Levantar con Docker Compose

```sh
docker compose up -d --build
```

- Panel: <http://localhost:3000>
- API: <http://localhost:8080/api/v1/health>
- Admin: `admin@uct.cl` / `admin1234` · Device key: `dev-device-key`

Si los puertos están ocupados (use las mismas variables en los siguientes `docker compose up`):

```sh
API_PORT=8088 MONGO_PORT=27019 WEB_PORT=3100 docker compose up -d --build
API_URL=http://localhost:8088 bash scripts/smoke.sh   # prueba de humo
```

`docker compose down` detiene todo (con `-v` borra también los datos).

> **Es un entorno de desarrollo.** Los secretos de `docker-compose.yml` son públicos y Mongo queda expuesto sin autenticación. Cámbielos antes de usarlo en un evento real.
>
> Cookie de sesión del panel: `COOKIE_SECURE` (en docker compose por defecto `false`, para poder entrar por HTTP desde otros equipos de la red local). Si el panel se publica con HTTPS, usar `COOKIE_SECURE=true`.

## Variables

Puertos del host (variables de entorno al ejecutar `docker compose`):

| Variable | Default |
|---|---|
| `API_PORT` | `8080` |
| `MONGO_PORT` | `27017` |
| `WEB_PORT` | `3000` |
| `HTTPS_PORT` | `8443` (solo con `--profile https`) |

Configuración de los servicios (se edita en `docker-compose.yml`):

| Servicio | Variable | Uso |
|---|---|---|
| api | `JWT_SECRET` | firma de las sesiones del panel |
| api | `DEVICE_API_KEY` | clave que usan las tablets |
| api | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | admin inicial (solo se crea si no existe) |
| api | `MONGO_URI`, `MONGO_DB` | base de datos |
| api | `CORS_ORIGINS`, `TZ_NAME`, `PORT` | orígenes permitidos, zona horaria, puerto interno |
| web | `API_URL` | URL de la API vista desde la web (`http://api:8080`) |

## Cargar el programa ECAD 2026

```sh
docker compose exec api seed -file seed/ecad2026.json
```

Crea el evento con sus 35 sesiones. Se puede repetir (es idempotente por nombre de evento); detalles en [`backend/README.md`](backend/README.md).

## Configurar la app móvil

Cómo compilar e instalar: [`mobile/README.md`](mobile/README.md). En la pantalla **Ajustes** de cada tablet:

| Ajuste | Valor |
|---|---|
| URL del servidor | `http://<IP LAN del PC>:<API_PORT>`, sin `/api/v1` (p. ej. `http://192.168.1.10:8080`) |
| Clave del dispositivo | el valor de `DEVICE_API_KEY` (`dev-device-key` en desarrollo) |

En Linux la IP LAN se ve con `ip -4 addr`. La tablet y el PC deben estar en la misma red y el firewall debe permitir el puerto de la API. Pulse **Probar conexión** y luego **Guardar**.

## Escaneo desde el navegador

Respaldo de la app Android cuando una tablet falla: el ayudante entra al panel desde su celular o notebook con su usuario, abre **Escanear QR** (`/escanear`), elige evento y sesión y lee el QR del asistente. Los registros aparecen en la pestaña **Asistentes** con el nombre que se le dio al dispositivo. Sin conexión quedan guardados en el navegador y se envían al volver la red (la página debe haberse abierto con conexión y no recargarse mientras no la haya).

Los navegadores solo permiten usar la cámara en un contexto seguro: **HTTPS**, o `http://localhost` en el mismo equipo. Abrir `http://<IP LAN>:3000` desde un celular no sirve. Para la red local, compose incluye Caddy con un certificado autofirmado:

```sh
COOKIE_SECURE=true HTTPS_HOST=192.168.1.10 docker compose --profile https up -d --build
```

- `HTTPS_HOST` es la IP LAN o el nombre del PC (por defecto `localhost`). En el celular se abre `https://192.168.1.10:8443/escanear` (puerto: `HTTPS_PORT`).
- La primera vez hay que aceptar la advertencia del certificado (*Avanzado → Continuar*; en Safari, *Mostrar detalles → visitar este sitio web*).
- `COOKIE_SECURE=true` marca la cookie de sesión como solo HTTPS: con él ya no se puede iniciar sesión por `http://<IP>:3000`. Repita las variables en cada `docker compose up` (o póngalas en un archivo `.env`).
- El firewall debe permitir el puerto HTTPS.

En producción use un dominio con certificado real (en el `Caddyfile`, el dominio en lugar de `:443` y sin `tls internal`; puertos 80 y 443 publicados) y `COOKIE_SECURE=true`.

### Usuarios y roles

En **Usuarios** (`/usuarios`) un administrador crea las cuentas. El rol `ayudante` solo puede escanear: al ingresar va directo a `/escanear` y no ve el resto del panel. El rol `admin` puede todo. Cree una cuenta de ayudante para quien escanea en lugar de compartir la de administrador. Si cambia a un ayudante a administrador, debe cerrar sesión y volver a entrar.

Un evento se puede duplicar con **Copiar** (lista o detalle): copia sus sesiones, sin registros de asistencia, y queda inactivo.

## Formato del QR

Texto plano separado por `|`:

```
nombre|rut|email[|extra...]
Daniela contreras|13816473|cferrer2021@alu.uct.cl
```

No se valida: sin `|`, todo el texto se toma como nombre. En cada sesión cuenta solo el primer escaneo de una persona (se identifica por RUT, o en su defecto por email o por el texto completo); los siguientes se guardan marcados como duplicados.

## Desarrollo y verificación

```sh
cd web && npm run lint && npm run build
bash scripts/smoke.sh
```

Los comandos de la API y la app móvil están en el README de cada carpeta.
