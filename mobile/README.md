# AutoCheck-in UCT — app Android

Check-in por QR para tablets o teléfonos fijos en la entrada de cada sala. React Native + Expo (SDK 58), TypeScript, expo-router. Consume la API de [`../docs/API.md`](../docs/API.md).

## Correr

Usa un **dev build** (no Expo Go). Requiere Node 22+.

```bash
npm install

# Local (Android SDK + JDK instalados, dispositivo con depuración USB o emulador)
npx expo run:android

# O en la nube con EAS
npx eas-cli@latest build --profile development --platform android
npx expo start --dev-client
```

Para instalar en las tablets del evento, genera un APK autónomo (sin servidor de desarrollo):

```bash
npx eas-cli@latest build --profile preview --platform android
# o local
npx expo run:android --variant release
```

`android/` e `ios/` se generan solos y no se commitean.

## Configurar cada dispositivo (pantalla Ajustes)

| Ajuste | Ejemplo |
|---|---|
| URL del servidor | `http://192.168.1.10:8080` (sin `/api/v1`) |
| Clave del dispositivo | el valor de `DEVICE_API_KEY` del backend |
| Nombre del dispositivo | `Tablet Sala 1` |
| Cámara por defecto | frontal |
| Segundos de la tarjeta | 4 |

Pulsa **Probar conexión** (comprueba `/health` y la clave) y luego **Guardar**. Se permite HTTP sin cifrar para servidores en red local; en ese caso la clave viaja en texto claro, así que usa una red de confianza o HTTPS.

## Uso y datos locales

Eventos → Sesión → Escáner. Cada escaneo se guarda primero en el dispositivo y luego se envía; sin conexión queda pendiente y se reintenta (cada 30 s con backoff hasta 5 min, y al recuperar la red). La sincronización solo corre con la app abierta.

En el directorio privado de la app:

- `registros.json`: todos los escaneos, incluida la cola de pendientes.
- `autocheckin_<evento>.xlsx`: un Excel por evento (se comparte desde Registros → **Exportar Excel**).

**Desinstalar la app o borrar sus datos elimina estos archivos**: sincroniza o exporta antes. Las horas del Excel usan la zona horaria del dispositivo (debe ser `America/Santiago`). "Sincronizar ahora" también reintenta los registros rechazados.

## Verificación

```bash
npx tsc --noEmit && npx jest && npx expo export --platform android
```

Nota: `xlsx` es la versión 0.18.5 de npm, que tiene avisos de seguridad al *leer* archivos manipulados; la app solo lee los Excel que ella misma escribe.
