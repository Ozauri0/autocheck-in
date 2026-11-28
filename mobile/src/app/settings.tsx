import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, colors, Credits, styles as ui } from '../components/ui';
import { getDeviceEvents, getHealth } from '../lib/api';
import { syncNow } from '../lib/autosync';
import { refreshEvents } from '../lib/events';
import { saveSettings, settingsStore } from '../lib/settings';

function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        {...props}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const saved = settingsStore.use();
  const insets = useSafeAreaInsets();
  const [serverUrl, setServerUrl] = useState(saved.serverUrl);
  const [deviceKey, setDeviceKey] = useState(saved.deviceKey);
  const [deviceName, setDeviceName] = useState(saved.deviceName);
  const [camera, setCamera] = useState(saved.camera);
  const [testing, setTesting] = useState(false);

  const config = () => ({ serverUrl: serverUrl.trim(), deviceKey: deviceKey.trim() });

  const save = async () => {
    try {
      await saveSettings({
        ...config(),
        deviceName: deviceName.trim() || 'Tablet',
        camera,
      });
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
      return;
    }
    Alert.alert('Ajustes', 'Guardados');
    refreshEvents();
    syncNow().catch(() => undefined);
  };

  const test = async () => {
    setTesting(true);
    try {
      await getHealth(config());
      // /health es público: se consulta además un endpoint que exige la clave.
      await getDeviceEvents(config());
      Alert.alert('Conexión', 'Servidor y clave correctos ✓');
    } catch (e) {
      Alert.alert('Conexión', (e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.content, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Field
        label="URL del servidor"
        placeholder="http://192.168.1.10:8080"
        keyboardType="url"
        value={serverUrl}
        onChangeText={setServerUrl}
      />
      <Field
        label="Clave del dispositivo"
        secureTextEntry
        value={deviceKey}
        onChangeText={setDeviceKey}
      />
      <Field
        label="Nombre del dispositivo"
        placeholder="Tablet Sala 1"
        autoCapitalize="sentences"
        value={deviceName}
        onChangeText={setDeviceName}
      />
      <Text style={styles.label}>Cámara por defecto</Text>
      <View style={styles.row}>
        {(['front', 'back'] as const).map((value) => (
          <View key={value} style={{ flex: 1 }}>
            <Button
              title={value === 'front' ? 'Frontal' : 'Trasera'}
              variant={camera === value ? 'primary' : 'secondary'}
              onPress={() => setCamera(value)}
            />
          </View>
        ))}
      </View>
      <Button title="Guardar" onPress={save} />
      <Button
        title={testing ? 'Probando…' : 'Probar conexión'}
        variant="secondary"
        onPress={test}
        disabled={testing}
      />
      <Text style={ui.muted}>ID del dispositivo: {saved.deviceId}</Text>
      <Credits />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 18, fontWeight: '700', color: colors.navy },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c5d0de',
    paddingHorizontal: 14,
    minHeight: 56,
    fontSize: 20,
    color: colors.text,
  },
  row: { flexDirection: 'row', gap: 12 },
});
