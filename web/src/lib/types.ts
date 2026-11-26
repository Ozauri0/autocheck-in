export interface Event {
  id: string;
  name: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EventSummary extends Event {
  sessionCount: number;
  checkinCount: number;
}

export interface Session {
  id: string;
  eventId: string;
  name: string;
  room: string;
  startsAt: string;
  endsAt: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type EventDetail = Event & { sessions: Session[] | null };

export interface Attendee {
  name: string;
  rut: string;
  email: string;
  extra: string[] | null;
}

export interface Checkin {
  id: string;
  clientId: string;
  eventId: string;
  sessionId: string;
  deviceId: string;
  deviceName: string;
  raw: string;
  attendee: Attendee;
  attendeeKey: string;
  scannedAt: string;
  receivedAt: string;
  duplicate: boolean;
}

export type CheckinRow = Checkin & { sessionName: string };

export interface CheckinPage {
  items: CheckinRow[] | null;
  total: number;
  page: number;
  limit: number;
}

export interface Stats {
  totalCheckins: number;
  uniqueAttendees: number;
  sessions: { sessionId: string; name: string; room: string; count: number }[] | null;
}

export interface Admin {
  id: string;
  email: string;
  name: string;
}

export type EventInput = Pick<
  Event,
  "name" | "description" | "location" | "startDate" | "endDate" | "active"
>;

export type SessionInput = Pick<Session, "name" | "room" | "startsAt" | "endsAt" | "order">;

export interface CheckinInput {
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
  status: "created" | "duplicate" | "exists" | "error";
  duplicate: boolean;
  message?: string;
}
