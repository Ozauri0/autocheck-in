import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { formatDate, formatTime } from '../lib/excelRows';
import { parseQr } from '../lib/qr';
import type { Outcome } from '../lib/scan';
import { colors } from './ui';

export interface Result {
  clientId: string;
  raw: string;
  scannedAt: string;
  outcome: Outcome;
  warning?: string;
}

function describe(outcome: Outcome): [string, string] {
  switch (outcome.kind) {
    case 'sending':
      return ['Registrando…', colors.blue];
    case 'ok':
      return ['✓ Registrado', colors.green];
    case 'duplicate':
      return ['Ya registrado en esta sesión', colors.orange];
    case 'offline':
      return ['Guardado sin conexión, se enviará luego', colors.navy];
    case 'error':
      return [`No registrado: ${outcome.message}`, colors.red];
  }
}

export function ResultCard({ result, onClose }: { result: Result; onClose: () => void }) {
  const { name, rut, email } = parseQr(result.raw);
  const [label, color] = describe(result.outcome);
  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <ScrollView style={styles.card} contentContainerStyle={styles.content}>
        <Text style={[styles.status, { backgroundColor: color }]}>{label}</Text>
        <Text style={styles.name}>{name || 'Sin nombre'}</Text>
        {!!rut && <Text style={styles.detail}>RUT: {rut}</Text>}
        {!!email && <Text style={styles.detail}>{email}</Text>}
        <Text style={styles.date}>
          {formatDate(result.scannedAt)} · {formatTime(result.scannedAt)}
        </Text>
        {!!result.warning && <Text style={styles.warning}>{result.warning}</Text>}
        <Text style={styles.hint}>Toca para continuar</Text>
      </ScrollView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11,35,65,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: { flexGrow: 0, width: '100%', maxWidth: 720, backgroundColor: '#fff', borderRadius: 20 },
  content: { padding: 24, gap: 10, alignItems: 'center' },
  status: {
    alignSelf: 'stretch',
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    padding: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  name: { fontSize: 40, fontWeight: '800', color: colors.navy, textAlign: 'center' },
  detail: { fontSize: 26, color: colors.text, textAlign: 'center' },
  date: { fontSize: 22, color: colors.muted },
  warning: { fontSize: 18, color: colors.red, textAlign: 'center' },
  hint: { fontSize: 16, color: colors.muted },
});
