// Turning database rows into the shapes the rest of the Worker uses. One place,
// so a column renamed is a change here and nowhere else.

import type { DateOrder, Role, StoredRecord } from "../../../shared/types";
import type { Passkey, Person } from "../../ports";

export interface PersonRow {
  id: string;
  email: string;
  name: string;
  role: string;
  photo_key: string | null;
  country: string | null;
  language: string | null;
  language_chosen: number;
  date_order: string;
  clock_24h: number;
  time_zone: string;
  created_at: string;
}

export function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: (row.role === "admin" ? "admin" : "user") as Role,
    photoKey: row.photo_key,
    country: row.country,
    language: row.language,
    languageChosen: !!row.language_chosen,
    dateOrder: row.date_order as DateOrder,
    clock24h: !!row.clock_24h,
    timeZone: row.time_zone,
    createdAt: row.created_at,
  };
}

export interface PasskeyRow {
  id: string;
  person_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  label: string | null;
}

export function toPasskey(row: PasskeyRow): Passkey {
  return {
    id: row.id,
    personId: row.person_id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: row.transports ? (JSON.parse(row.transports) as string[]) : null,
    label: row.label,
  };
}

export interface RecordRow {
  id: number;
  imei: string;
  vehicle_id: string | null;
  at: string;
  received_at: string;
  priority: number;
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  satellites: number;
  speed: number;
  event_io: number;
  ignition: number | null;
  movement: number | null;
  odometer_m: number | null;
  fuel_pct: number | null;
  fuel_l: number | null;
  voltage_mv: number | null;
  io: string;
}

export function toRecord(row: RecordRow): StoredRecord {
  return {
    id: row.id,
    imei: row.imei,
    vehicleId: row.vehicle_id,
    at: row.at,
    receivedAt: row.received_at,
    priority: row.priority,
    lat: row.lat,
    lon: row.lon,
    altitude: row.altitude,
    heading: row.heading,
    satellites: row.satellites,
    speed: row.speed,
    eventIo: row.event_io,
    ignition: row.ignition,
    movement: row.movement,
    odometerM: row.odometer_m,
    fuelPct: row.fuel_pct,
    fuelL: row.fuel_l,
    voltageMv: row.voltage_mv,
    io: JSON.parse(row.io) as StoredRecord["io"],
  };
}
