import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { colors, styles } from '../components/ui';
import { startAutoSync } from '../lib/autosync';
import { loadRecords } from '../lib/db';
import { loadEventsCache, refreshEvents } from '../lib/events';
import { loadSettings } from '../lib/settings';

export default function Layout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let stop: (() => void) | undefined;
    (async () => {
      await loadSettings();
      await loadRecords();
      await loadEventsCache().catch(() => undefined);
      setReady(true);
      stop = startAutoSync();
      refreshEvents();
    })().catch((e) => setError((e as Error).message));
    return () => stop?.();
  }, []);

  if (!ready) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        {error ? (
          <Text style={styles.notice}>No se pudieron leer los datos locales: {error}</Text>
        ) : (
          <ActivityIndicator size="large" color={colors.blue} />
        )}
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy },
          headerTintColor: '#fff',
          headerTitleStyle: { fontSize: 22, fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Eventos' }} />
        <Stack.Screen name="sessions/[eventId]" options={{ title: 'Sesiones' }} />
        <Stack.Screen name="scanner" options={{ headerShown: false }} />
        <Stack.Screen name="records" options={{ title: 'Registros' }} />
        <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
      </Stack>
    </>
  );
}
