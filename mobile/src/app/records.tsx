import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, colors, StatusBadge, styles } from '../components/ui';
import { syncNow } from '../lib/autosync';
import { recordsStore } from '../lib/db';
import { exportExcel } from '../lib/excel';
import { formatDate, formatTime } from '../lib/excelRows';
import { parseQr } from '../lib/qr';
import { statusLabel } from '../lib/records';
import type { LocalRecord } from '../lib/types';

const statusColor = (r: LocalRecord) =>
  r.status === 'error'
    ? colors.red
    : r.status === 'pending'
      ? colors.blue
      : r.duplicate
        ? colors.orange
        : colors.green;

export default function RecordsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const all = recordsStore.use();
  const records = all.filter((r) => r.eventId === eventId);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sync = () =>
    run(async () => {
      const { sent, failed, error } = await syncNow();
      Alert.alert(
        'Sincronización',
        `Enviados: ${sent} · Rechazados: ${failed}${error ? `\n${error}` : ''}`,
      );
    });

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
      data={[...records].reverse()}
      keyExtractor={(r) => r.clientId}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <StatusBadge />
          <Button title="Sincronizar ahora" onPress={sync} disabled={busy} />
          <Button
            title="Exportar Excel"
            variant="secondary"
            onPress={() => run(() => exportExcel(records))}
            disabled={busy || !records.length}
          />
          <Text style={styles.muted}>{records.length} escaneos de este evento en este dispositivo</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.muted}>Aún no hay escaneos.</Text>}
      renderItem={({ item }) => {
        const attendee = parseQr(item.raw);
        return (
          <Card>
            <Text style={styles.title}>{attendee.name || item.raw}</Text>
            <Text style={styles.text}>
              {[attendee.rut, attendee.email].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.muted}>
              {formatDate(item.scannedAt)} {formatTime(item.scannedAt)} · {item.sessionName}
            </Text>
            <Text style={[styles.text, { color: statusColor(item), fontWeight: '700' }]}>
              {statusLabel(item)}
              {item.error ? `: ${item.error}` : ''}
            </Text>
          </Card>
        );
      }}
    />
  );
}
