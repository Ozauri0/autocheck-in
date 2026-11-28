import { router } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BrandHeader,
  Button,
  Card,
  Credits,
  formatRange,
  goSettings,
  StatusBadge,
  styles,
} from '../components/ui';
import { eventsStore, refreshEvents } from '../lib/events';
import { settingsStore } from '../lib/settings';

export default function EventsScreen() {
  const { events, fromCache, loading, error } = eventsStore.use();
  const { serverUrl } = settingsStore.use();
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
      data={events}
      keyExtractor={(e) => e.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshEvents} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <BrandHeader />
          <StatusBadge />
          {!serverUrl && <Text style={styles.notice}>Configura el servidor en Ajustes.</Text>}
          {fromCache && error && (
            <Text style={styles.notice}>Sin conexión – datos en caché ({error})</Text>
          )}
          {!fromCache && error && <Text style={styles.notice}>{error}</Text>}
          <Button title="⚙ Ajustes" variant="secondary" onPress={goSettings} />
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.muted}>
          {loading ? 'Cargando eventos…' : 'No hay eventos activos. Desliza hacia abajo para actualizar.'}
        </Text>
      }
      ListFooterComponent={<Credits />}
      renderItem={({ item }) => (
        <Card
          onPress={() =>
            router.push({ pathname: '/sessions/[eventId]', params: { eventId: item.id } })
          }
        >
          <Text style={styles.title}>{item.name}</Text>
          {!!item.location && <Text style={styles.text}>{item.location}</Text>}
          <Text style={styles.muted}>
            {formatRange(item.startDate, item.endDate)} · {item.sessions.length} sesiones
          </Text>
        </Card>
      )}
    />
  );
}
