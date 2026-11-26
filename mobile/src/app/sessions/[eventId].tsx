import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, formatRange, StatusBadge, styles } from '../../components/ui';
import { eventsStore, refreshEvents } from '../../lib/events';

export default function SessionsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { events, loading } = eventsStore.use();
  const insets = useSafeAreaInsets();
  const event = events.find((e) => e.id === eventId);
  const sessions = [...(event?.sessions ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
      data={sessions}
      keyExtractor={(s) => s.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshEvents} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <StatusBadge />
          <Text style={styles.title}>{event?.name ?? 'Evento no disponible'}</Text>
          <Button
            title="Registros y sincronización"
            variant="secondary"
            onPress={() => router.push({ pathname: '/records', params: { eventId } })}
          />
          <Text style={styles.muted}>Elige la sesión de esta sala para empezar a escanear.</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.muted}>Este evento no tiene sesiones.</Text>}
      renderItem={({ item }) => (
        <Card
          onPress={() =>
            router.push({ pathname: '/scanner', params: { eventId, sessionId: item.id } })
          }
        >
          <Text style={styles.title}>{item.name}</Text>
          {!!item.room && <Text style={styles.text}>Sala: {item.room}</Text>}
          <Text style={styles.muted}>{formatRange(item.startsAt, item.endsAt, true)}</Text>
        </Card>
      )}
    />
  );
}
