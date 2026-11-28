# AutoCheck-in UCT — app Android

Check-in por QR para tablets o teléfonos fijos en la entrada de cada sala. React Native + Expo (SDK 58), TypeScript, expo-router. Consume la API de [`../docs/API.md`](../docs/API.md).

## Correr

Usa un **dev build** (no Expo Go). Requiere Node 22+.

```bash
bun install

# Local (Android SDK + JDK instalados, dispositivo con depuración USB o emulador)
bunx expo run:android

# O en la nube con EAS
bunx eas-cli@latest build --profile development --platform android
bunx expo start --dev-client
```

Para instalar en las tablets del evento, genera un APK autónomo (sin servidor de desarrollo):

```bash
bunx eas-cli@latest build --profile preview --platform android
# o local
bunx expo run:android --variant release
```

`android/` e `ios/` se generan solos y no se commitean.

## Configurar cada dispositivo (pantalla Ajustes)

| Ajuste | Ejemplo |
|---|---|
| URL del servidor | `http://192.168.1.10:8080` (sin `/api/v1`) |
| Clave del dispositivo | el valor de `DEVICE_API_KEY` del backend |
| Nombre del dispositivo | `Tablet Sala 1` |
| Cámara por defecto | frontal |

Pulsa **Probar conexión** (comprueba `/health` y la clave) y luego **Guardar**. Se permite HTTP sin cifrar para servidores en red local; en ese caso la clave viaja en texto claro, así que usa una red de confianza o HTTPS.

## Uso y datos locales

Eventos → Sesión → Escáner. Cada escaneo muestra una tarjeta con su resultado que se cierra sola a los 2 s (tocarla la cierra antes). Cada escaneo se guarda primero en el dispositivo y luego se envía; sin conexión queda pendiente y se reintenta (cada 30 s con backoff hasta 5 min, y al recuperar la red). La sincronización solo corre con la app abierta.

En el directorio privado de la app:

- `registros.json`: todos los escaneos, incluida la cola de pendientes.
- `autocheckin_<evento>.xlsx`: un Excel por evento (se comparte desde Registros → **Exportar Excel**).

**Desinstalar la app o borrar sus datos elimina estos archivos**: sincroniza o exporta antes. Las horas del Excel usan la zona horaria del dispositivo (debe ser `America/Santiago`). "Sincronizar ahora" también reintenta los registros rechazados.

## Verificación

```bash
bunx tsc --noEmit && bun run test && bunx expo export --platform android
```

Nota: `xlsx` es la versión 0.18.5 del registro npm, que tiene avisos de seguridad al *leer* archivos manipulados; la app solo lee los Excel que ella misma escribe.
