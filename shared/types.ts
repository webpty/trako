// What the page and the Worker say to each other.

export type Role = "admin" | "user";

/** dmmmy: 31 Dec 2026, dmy: 31/12/2026, mdy: 12/31/2026, ymd: 2026-12-31. */
export type DateOrder = "dmmmy" | "dmy" | "mdy" | "ymd";

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  photoKey: string | null;
  country: string | null;
  language: string | null;
  languageChosen: boolean;
  dateOrder: DateOrder;
  clock24h: boolean;
  timeZone: string;
}

export interface SettingsPatch {
  name?: string;
  country?: string | null;
  language?: string;
  dateOrder?: DateOrder;
  clock24h?: boolean;
  timeZone?: string;
}

export interface Vehicle {
  id: string;
  name: string;
  region: string | null;
  tracker: string | null;
  colour: string;
  personId: string | null;
  /** The IMEIs of the trackers in it now. */
  imeis: string[];
  lastSeenAt: string | null;
}

export interface Tracker {
  imei: string;
  vehicleId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  records: number;
}

export interface Person {
  id: string;
  email: string;
  name: string;
  role: Role;
  photoKey: string | null;
}

/** One record as the relay hands it over. */
export interface IncomingRecord {
  at: string;
  priority: number;
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  satellites: number;
  speed: number;
  eventIo: number;
  io: Record<string, number | string>;
}

export interface IncomingBatch {
  imei: string;
  receivedAt: string;
  records: IncomingRecord[];
}

/** One stored record, for the raw data table. */
export interface StoredRecord {
  id: number;
  imei: string;
  vehicleId: string | null;
  at: string;
  receivedAt: string;
  priority: number;
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  satellites: number;
  speed: number;
  eventIo: number;
  ignition: number | null;
  movement: number | null;
  odometerM: number | null;
  fuelPct: number | null;
  fuelL: number | null;
  voltageMv: number | null;
  io: Record<string, number | string>;
}

/** A vehicle's track for the map: [lon, lat] pairs, oldest first, and its
    last known point within the time asked for. */
export interface MapTrack {
  vehicleId: string;
  points: [number, number][];
  last: { lon: number; lat: number; at: string; speed: number } | null;
}

export type DashboardPeriod = "all" | "year" | "90" | "30";

export interface Figures {
  distanceM: number;
  drivingS: number;
  maxSpeed: number;
  trips: number;
  /** Only where the tracker reports litres; null when nothing does. */
  fuelUsedL: number | null;
  records: number;
  days: number;
}

export interface Dashboard {
  total: Figures;
  vehicles: ({ vehicleId: string } & Figures)[];
}
