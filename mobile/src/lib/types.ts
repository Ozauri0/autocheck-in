export interface Session {
  id: string;
  eventId: string;
  name: string;
  room?: string;
  startsAt: string;
  endsAt: string;
  order?: number;
}

export interface EventItem {
  id: string;
  name: string;
  description?: string;
  location?: string;
  startDate: string;
  endDate: string;
  active: boolean;
  sessions: Session[];
}

/** Cuerpo de cada elemento de POST /device/checkins. */
export interface CheckinPayload {
  clientId: string;
  eventId: string;
  sessionId: string;
  deviceId: string;
  deviceName: string;
  raw: string;
  scannedAt: string;
}

export interface CheckinResult {
  clientId: string;
  status: 'created' | 'duplicate' | 'exists' | 'error';
  message?: string;
}

export type SendStatus = 'pending' | 'sent' | 'error';

/** Registro local: lo que se envía más los datos para mostrarlo y exportarlo sin conexión. */
export interface LocalRecord extends CheckinPayload {
  eventName: string;
  sessionName: string;
  room: string;
  status: SendStatus;
  duplicate: boolean;
  error?: string;
}

export interface ServerConfig {
  serverUrl: string;
  deviceKey: string;
}

export interface Settings extends ServerConfig {
  deviceName: string;
  deviceId: string;
  camera: 'front' | 'back';
  cardSeconds: number;
}
