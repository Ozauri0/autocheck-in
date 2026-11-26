import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Result, ResultCard } from '../components/ResultCard';
import { Button, colors, StatusBadge, styles as ui } from '../components/ui';
import { eventsStore } from '../lib/events';
import { createRecord, sendRecord } from '../lib/scan';
import { settingsStore } from '../lib/settings';

const SAME_QR_MS = 5000;

export default function ScannerScreen() {
  useKeepAwake();
  const { eventId, sessionId } = useLocalSearchParams<{ eventId: string; sessionId: string }>();
  const { events } = eventsStore.use();
  const settings = settingsStore.use();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState(settings.camera);
  const [result, setResult] = useState<Result | null>(null);
  const [failure, setFailure] = useState<string>();

  // Refs: la cámara dispara muchas veces por segundo, antes de que React re-renderice.
  const busy = useRef(false);
  const seen = useRef(new Map<string, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = useRef<string | undefined>(undefined);

  const event = events.find((e) => e.id === eventId);
  const session = event?.sessions.find((s) => s.id === sessionId);
  // Se conservan aunque un refresco quite el evento mientras se escanea.
  const [target] = useState(() => (event && session ? { event, session } : null));

  const close = useCallback(() => {
    clearTimeout(timer.current);
    shown.current = undefined;
    setResult(null);
    busy.current = false;
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onScan = async (raw: string) => {
    const now = Date.now();
    if (!target || busy.current || !raw.trim()) return;
    if (now - (seen.current.get(raw) ?? 0) < SAME_QR_MS) return;
    busy.current = true;
    seen.current.set(raw, now);
    setFailure(undefined);
    Vibration.vibrate(120);

    try {
      const { record, excelError } = await createRecord(target.event, target.session, raw);
      const card: Result = {
        clientId: record.clientId,
        raw,
        scannedAt: record.scannedAt,
        outcome: { kind: 'sending' },
        warning: excelError && `No se pudo escribir el Excel: ${excelError}`,
      };
      shown.current = record.clientId;
      setResult(card);
      const outcome = await sendRecord(record, (late) =>
        setResult((current) =>
          current?.clientId === record.clientId ? { ...current, outcome: late } : current,
        ),
      );
      // La tarjeta ya se cerró con un toque: no volver a abrirla.
      if (shown.current !== record.clientId) return;
      setResult({ ...card, outcome });
      if (outcome.kind === 'duplicate' || outcome.kind === 'error') {
        Vibration.vibrate([0, 200, 100, 200]);
      }
      timer.current = setTimeout(close, settings.cardSeconds * 1000);
    } catch (e) {
      // No quedó guardado: se permite reintentar de inmediato.
      seen.current.delete(raw);
      busy.current = false;
      setFailure(`No se pudo guardar el registro: ${(e as Error).message}`);
      Vibration.vibrate([0, 400, 200, 400]);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Volver">
        <Text style={styles.backText}>‹</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.event} numberOfLines={1}>
          {target?.event.name ?? 'Sesión no disponible'}
        </Text>
        {target && (
          <Text style={styles.session} numberOfLines={2}>
            {target.session.name}
            {target.session.room ? ` · ${target.session.room}` : ''}
          </Text>
        )}
      </View>
    </View>
  );

  if (!permission?.granted) {
    return (
      <View style={ui.screen}>
        {header}
        <View style={ui.content}>
          <Text style={ui.text}>Se necesita permiso de cámara para leer los códigos QR.</Text>
          <Button
            title="Permitir cámara"
            onPress={() =>
              permission && !permission.canAskAgain ? Linking.openSettings() : requestPermission()
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {focused && target && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing={facing}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={result ? undefined : ({ data }) => onScan(data)}
        />
      )}
      {header}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {failure && <Text style={ui.notice}>{failure}</Text>}
        <Text style={styles.prompt}>Acerca tu código QR a la cámara</Text>
        <View style={styles.statusBox}>
          <StatusBadge />
        </View>
        <View style={styles.actions}>
          <Button
            title={facing === 'front' ? 'Cámara: frontal ⇄' : 'Cámara: trasera ⇄'}
            onPress={() => setFacing(facing === 'front' ? 'back' : 'front')}
          />
          <Button
            title="Registros"
            variant="secondary"
            onPress={() => router.push({ pathname: '/records', params: { eventId } })}
          />
        </View>
      </View>
      {result && <ResultCard result={result} onClose={close} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between' },
  header: {
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  back: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 44, lineHeight: 50 },
  event: { color: '#fff', fontSize: 24, fontWeight: '800' },
  session: { color: '#cfe8fa', fontSize: 18 },
  footer: { padding: 16, gap: 10, alignItems: 'center' },
  prompt: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 8,
  },
  statusBox: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
});
