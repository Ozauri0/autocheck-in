import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { networkStore, reachableStore } from '../lib/connection';
import { recordsStore } from '../lib/db';

export const colors = {
  navy: '#0b2341',
  blue: '#1f8fd6',
  bg: '#f2f5f9',
  card: '#ffffff',
  text: '#13233a',
  muted: '#5c6b80',
  green: '#1b8a4b',
  orange: '#c56a00',
  red: '#c0392b',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const secondary = variant === 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.navy }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
    >
      {children}
    </Pressable>
  );
}

/** Indicador de conexión y de registros pendientes de envío. */
export function StatusBadge() {
  const network = networkStore.use();
  const reachable = reachableStore.use();
  const records = recordsStore.use();
  const pending = records.filter((r) => r.status === 'pending').length;
  const errors = records.filter((r) => r.status === 'error').length;

  const [label, color] = !network
    ? ['Sin red', colors.red]
    : reachable === false
      ? ['Servidor no disponible', colors.orange]
      : reachable
        ? ['Conectado', colors.green]
        : ['Sin comprobar', colors.muted];

  return (
    <View style={styles.status}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.statusText}>{label}</Text>
      <Text style={styles.statusText}>
        · {pending} pendiente{pending === 1 ? '' : 's'}
      </Text>
      {errors > 0 && <Text style={[styles.statusText, { color: colors.red }]}>· {errors} con error</Text>}
    </View>
  );
}

export const goSettings = () => router.push('/settings');

export function formatRange(start: string, end: string, withTime = false): string {
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }),
  };
  const format = (iso: string) => new Date(iso).toLocaleString('es-CL', options);
  const a = format(start);
  const b = format(end);
  return a === b ? a : `${a} – ${b}`;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, width: '100%', maxWidth: 800, alignSelf: 'center' },
  button: {
    backgroundColor: colors.blue,
    borderRadius: 12,
    minHeight: 60,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.blue },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 20,
    gap: 6,
    borderLeftWidth: 6,
    borderLeftColor: colors.blue,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.navy },
  text: { fontSize: 18, color: colors.text },
  muted: { fontSize: 16, color: colors.muted },
  notice: {
    backgroundColor: '#fff1d6',
    color: '#6b4300',
    padding: 14,
    borderRadius: 10,
    fontSize: 17,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  statusText: { fontSize: 17, color: colors.text, fontWeight: '600' },
});
