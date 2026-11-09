import type { Tracker, Vehicle } from "../../../shared/types";
import type { TrackerStore, VehicleStore } from "../../ports";

interface VehicleRow {
  id: string;
  name: string;
  region: string | null;
  tracker: string | null;
  colour: string;
  person_id: string | null;
  imeis: string | null;
  last_seen_at: string | null;
}

const VEHICLES = `SELECT v.id, v.name, v.region, v.tracker, v.colour, v.person_id,
    group_concat(t.imei) AS imeis, max(t.last_seen_at) AS last_seen_at
  FROM vehicles v LEFT JOIN trackers t ON t.vehicle_id = v.id`;

function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    tracker: row.tracker,
    colour: row.colour,
    personId: row.person_id,
    imeis: row.imeis ? row.imeis.split(",") : [],
    lastSeenAt: row.last_seen_at,
  };
}

export class D1Vehicles implements VehicleStore {
  constructor(private readonly db: D1Database) {}

  async all(): Promise<Vehicle[]> {
    const { results } = await this.db.prepare(`${VEHICLES} GROUP BY v.id ORDER BY v.position, v.name`).all<VehicleRow>();
    return results.map(toVehicle);
  }

  async byId(id: string): Promise<Vehicle | null> {
    const row = await this.db.prepare(`${VEHICLES} WHERE v.id = ? GROUP BY v.id`).bind(id).first<VehicleRow>();
    return row ? toVehicle(row) : null;
  }

  async assign(id: string, personId: string | null): Promise<void> {
    await this.db.prepare(`UPDATE vehicles SET person_id = ? WHERE id = ?`).bind(personId, id).run();
  }
}

export class D1Trackers implements TrackerStore {
  constructor(private readonly db: D1Database) {}

  async all(): Promise<Tracker[]> {
    const { results } = await this.db
      .prepare(
        `SELECT t.imei, t.vehicle_id, t.first_seen_at, t.last_seen_at,
           (SELECT COUNT(*) FROM records r WHERE r.imei = t.imei) AS records
         FROM trackers t ORDER BY t.vehicle_id IS NOT NULL, t.first_seen_at`,
      )
      .all<{ imei: string; vehicle_id: string | null; first_seen_at: string; last_seen_at: string; records: number }>();
    return results.map((row) => ({
      imei: row.imei,
      vehicleId: row.vehicle_id,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      records: row.records,
    }));
  }

  async seen(imei: string, at: string): Promise<string | null> {
    const row = await this.db
      .prepare(
        `INSERT INTO trackers (imei, first_seen_at, last_seen_at) VALUES (?, ?, ?)
         ON CONFLICT (imei) DO UPDATE SET last_seen_at = max(last_seen_at, excluded.last_seen_at)
         RETURNING vehicle_id`,
      )
      .bind(imei, at, at)
      .first<{ vehicle_id: string | null }>();
    return row?.vehicle_id ?? null;
  }

  async place(imei: string, vehicleId: string | null): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE trackers SET vehicle_id = ? WHERE imei = ?`).bind(vehicleId, imei),
      this.db.prepare(`UPDATE records SET vehicle_id = ? WHERE imei = ? AND vehicle_id IS NULL`).bind(vehicleId, imei),
      // Those days have new records for their vehicle, so their figures are
      // worked out again.
      this.db
        .prepare(
          `INSERT OR IGNORE INTO dirty_days (vehicle_id, day)
           SELECT DISTINCT vehicle_id, substr(at, 1, 10) FROM records WHERE imei = ? AND vehicle_id IS NOT NULL`,
        )
        .bind(imei),
    ]);
    return (results[0].meta.changes ?? 0) > 0;
  }
}
