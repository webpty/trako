import { IO } from "../../../shared/io";
import type { Point } from "../../../shared/figures";
import type { IncomingRecord, MapTrack, StoredRecord } from "../../../shared/types";
import type { RecordStore } from "../../ports";
import { toRecord, type RecordRow } from "./rows";

/** D1 takes a batch of statements at a time; this many keeps each one small. */
const PER_BATCH = 100;

/** A fix the tracker had satellites for, and not the 0,0 it sends without. */
const GOOD_FIX = `satellites >= 3 AND NOT (lat = 0 AND lon = 0)`;

function number(value: number | string | undefined): number | null {
  return typeof value === "number" ? value : null;
}

/** The OEM odometer is in kilometres and the tracker's own in metres; the
    tracker's own wins where both are sent, as it never stops counting. */
function odometerM(io: IncomingRecord["io"]): number | null {
  const own = number(io[IO.odometer]);
  if (own !== null) return own;
  const oem = number(io[IO.oemMileageKm]);
  return oem === null ? null : oem * 1000;
}

export class D1Records implements RecordStore {
  constructor(private readonly db: D1Database) {}

  async add(imei: string, vehicleId: string | null, receivedAt: string, records: IncomingRecord[]): Promise<number> {
    let added = 0;
    for (let i = 0; i < records.length; i += PER_BATCH) {
      const statements = records.slice(i, i + PER_BATCH).map((r) => {
        const tenths = number(r.io[IO.fuelTenthsL]);
        return this.db
          .prepare(
            `INSERT OR IGNORE INTO records
               (imei, vehicle_id, at, received_at, priority, lat, lon, altitude, heading, satellites,
                speed, event_io, ignition, movement, odometer_m, fuel_pct, fuel_l, voltage_mv, io)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            imei,
            vehicleId,
            r.at,
            receivedAt,
            r.priority,
            r.lat,
            r.lon,
            r.altitude,
            r.heading,
            r.satellites,
            r.speed,
            r.eventIo,
            number(r.io[IO.ignition]),
            number(r.io[IO.movement]),
            odometerM(r.io),
            number(r.io[IO.fuelPct]),
            tenths === null ? null : tenths / 10,
            number(r.io[IO.externalMv]),
            JSON.stringify(r.io),
          );
      });
      const results = await this.db.batch(statements);
      added += results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
    }
    return added;
  }

  async page(filter: { vehicleId?: string; imei?: string }, beforeId: number | null, limit: number): Promise<StoredRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter.vehicleId) {
      where.push("vehicle_id = ?");
      values.push(filter.vehicleId);
    }
    if (filter.imei) {
      where.push("imei = ?");
      values.push(filter.imei);
    }
    if (beforeId !== null) {
      where.push("id < ?");
      values.push(beforeId);
    }
    // Newest first by when it arrived, which is the order of `id`; a tracker
    // emptying its memory after a day offline sends old records late.
    const { results } = await this.db
      .prepare(`SELECT * FROM records ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`)
      .bind(...values, limit)
      .all<RecordRow>();
    return results.map(toRecord);
  }

  async track(vehicleId: string, from: string, to: string, most: number): Promise<MapTrack> {
    const range = `vehicle_id = ? AND at >= ? AND at <= ? AND ${GOOD_FIX}`;
    const counted = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM records WHERE ${range}`)
      .bind(vehicleId, from, to)
      .first<{ n: number }>();
    const n = counted?.n ?? 0;
    if (n === 0) return { vehicleId, points: [], last: null };

    // Every k-th point, so a year of driving is still a line the page can draw.
    const step = Math.max(1, Math.ceil(n / most));
    const [thinned, last] = await this.db.batch<{ lon: number; lat: number; at: string; speed: number }>([
      this.db
        .prepare(
          `SELECT lon, lat FROM (
             SELECT lon, lat, at, row_number() OVER (ORDER BY at) AS n FROM records WHERE ${range}
           ) WHERE (n - 1) % ? = 0 ORDER BY at`,
        )
        .bind(vehicleId, from, to, step),
      this.db.prepare(`SELECT lon, lat, at, speed FROM records WHERE ${range} ORDER BY at DESC LIMIT 1`).bind(vehicleId, from, to),
    ]);
    const points = thinned.results.map((p) => [p.lon, p.lat] as [number, number]);
    const end = last.results[0] ?? null;
    if (end) points.push([end.lon, end.lat]);
    return { vehicleId, points, last: end };
  }

  async day(vehicleId: string, day: string): Promise<{ points: Point[]; before: Point | null }> {
    const columns = `at, lat, lon, speed, satellites, ignition, fuel_l AS fuelL`;
    const [today, before] = await this.db.batch<Point>([
      this.db
        .prepare(`SELECT ${columns} FROM records WHERE vehicle_id = ? AND at >= ? AND at < ? ORDER BY at`)
        .bind(vehicleId, `${day}T00:00:00.000Z`, nextDay(day)),
      this.db
        .prepare(`SELECT ${columns} FROM records WHERE vehicle_id = ? AND at < ? ORDER BY at DESC LIMIT 1`)
        .bind(vehicleId, `${day}T00:00:00.000Z`),
    ]);
    return { points: today.results, before: before.results[0] ?? null };
  }
}

function nextDay(day: string): string {
  const next = new Date(`${day}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
