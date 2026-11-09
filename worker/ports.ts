// What the rules need from the world, as interfaces. The real things are put
// behind them in app.ts; nothing in domain/ reaches past one of these.

import type { DayFigures } from "../shared/figures";
import type { Point } from "../shared/figures";
import type {
  DateOrder,
  Figures,
  IncomingRecord,
  MapTrack,
  Me,
  Role,
  StoredRecord,
  Tracker,
  Vehicle,
} from "../shared/types";

export interface Person extends Me {
  createdAt: string;
}

export interface PeopleStore {
  byId(id: string): Promise<Person | null>;
  byEmail(email: string): Promise<Person | null>;
  all(): Promise<Person[]>;
  add(
    person: {
      id: string;
      email: string;
      name: string;
      role: Role;
      timeZone: string;
      dateOrder: DateOrder;
      clock24h: boolean;
    },
    now: string,
  ): Promise<void>;
  update(id: string, patch: Partial<Me>): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface CodeStore {
  recentCount(email: string, since: string): Promise<number>;
  put(email: string, codeHash: string, expiresAt: string, now: string): Promise<void>;
  /** Finds an unused, unexpired code and marks it used in the same statement,
      so a code cannot be spent twice however fast the second try arrives. */
  claim(email: string, codeHash: string, now: string): Promise<boolean>;
  expireAll(email: string, now: string): Promise<void>;
  addTry(email: string, now: string): Promise<void>;
  triesSince(email: string, since: string): Promise<number>;
  pruneTries(before: string): Promise<void>;
}

export interface SessionStore {
  create(personId: string, expiresAt: string, now: string): Promise<string>;
  personFor(sessionId: string, now: string): Promise<Person | null>;
  destroy(sessionId: string): Promise<void>;
  prune(now: string): Promise<void>;
}

export interface ChallengeStore {
  put(purpose: string, value: string, personId: string | null, expiresAt: string, now: string): Promise<void>;
  spend(purpose: string, value: string, now: string): Promise<{ personId: string | null } | undefined>;
}

export interface Passkey {
  id: string;
  personId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  label: string | null;
}

export interface PasskeyStore {
  forPerson(personId: string): Promise<Passkey[]>;
  byId(id: string): Promise<Passkey | null>;
  add(key: Passkey, now: string): Promise<void>;
  touch(id: string, counter: number, now: string): Promise<void>;
  remove(id: string, personId: string): Promise<void>;
}

export interface VehicleStore {
  all(): Promise<Vehicle[]>;
  byId(id: string): Promise<Vehicle | null>;
  /** Given to a person, or to nobody. */
  assign(id: string, personId: string | null): Promise<void>;
}

export interface TrackerStore {
  all(): Promise<Tracker[]>;
  /** Registers an IMEI the first time it is seen, unassigned, and moves its
      last-seen time on. Answers the vehicle it is in. */
  seen(imei: string, at: string): Promise<string | null>;
  /** Puts a tracker in a vehicle, or takes it out. Records it sent while in no
      vehicle at all are given to the new one, so nothing from the first
      connection is lost. */
  place(imei: string, vehicleId: string | null): Promise<boolean>;
}

export interface RecordStore {
  /** Keeps each record once: one sent again by the relay is ignored. Answers
      how many were new. */
  add(imei: string, vehicleId: string | null, receivedAt: string, records: IncomingRecord[]): Promise<number>;
  /** Newest first, older than `beforeId` when given. */
  page(filter: { vehicleId?: string; imei?: string }, beforeId: number | null, limit: number): Promise<StoredRecord[]>;
  /** The vehicle's track between two moments, thinned to at most `most` points. */
  track(vehicleId: string, from: string, to: string, most: number): Promise<MapTrack>;
  /** One day's records for working out its figures, and the one before it. */
  day(vehicleId: string, day: string): Promise<{ points: Point[]; before: Point | null }>;
}

export interface DayStore {
  markDirty(pairs: { vehicleId: string; day: string }[]): Promise<void>;
  dirty(limit: number): Promise<{ vehicleId: string; day: string }[]>;
  save(vehicleId: string, day: string, figures: DayFigures): Promise<void>;
  /** Added up over the vehicles and the days from `from` (YYYY-MM-DD) on. */
  totals(vehicleIds: string[], from: string | null): Promise<({ vehicleId: string } & Figures)[]>;
}

export interface MediaStore {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export interface OutgoingMail {
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  text?: string;
  html?: string;
  /** Pictures carried inside the message, so nothing loads from outside. */
  inline?: { content: ArrayBuffer; filename: string; type: string; contentId: string }[];
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface Random {
  bytes(n: number): Uint8Array;
}
