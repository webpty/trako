import type { DayFigures } from "../../../shared/figures";
import type { Figures } from "../../../shared/types";
import type { DayStore } from "../../ports";

export class D1Days implements DayStore {
  constructor(private readonly db: D1Database) {}

  async markDirty(pairs: { vehicleId: string; day: string }[]): Promise<void> {
    if (!pairs.length) return;
    await this.db.batch(
      pairs.map((pair) =>
        this.db.prepare(`INSERT OR IGNORE INTO dirty_days (vehicle_id, day) VALUES (?, ?)`).bind(pair.vehicleId, pair.day),
      ),
    );
  }

  async dirty(limit: number): Promise<{ vehicleId: string; day: string }[]> {
    const { results } = await this.db
      .prepare(`SELECT vehicle_id, day FROM dirty_days ORDER BY day LIMIT ?`)
      .bind(limit)
      .all<{ vehicle_id: string; day: string }>();
    return results.map((row) => ({ vehicleId: row.vehicle_id, day: row.day }));
  }

  async save(vehicleId: string, day: string, f: DayFigures): Promise<void> {
    await this.db.batch([
      f.records === 0
        ? this.db.prepare(`DELETE FROM days WHERE vehicle_id = ? AND day = ?`).bind(vehicleId, day)
        : this.db
            .prepare(
              `INSERT INTO days (vehicle_id, day, distance_m, driving_s, max_speed, trips, fuel_used_l, records)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (vehicle_id, day) DO UPDATE SET
                 distance_m = excluded.distance_m, driving_s = excluded.driving_s,
                 max_speed = excluded.max_speed, trips = excluded.trips,
                 fuel_used_l = excluded.fuel_used_l, records = excluded.records`,
            )
            .bind(vehicleId, day, f.distanceM, f.drivingS, f.maxSpeed, f.trips, f.fuelUsedL, f.records),
      this.db.prepare(`DELETE FROM dirty_days WHERE vehicle_id = ? AND day = ?`).bind(vehicleId, day),
    ]);
  }

  async totals(vehicleIds: string[], from: string | null): Promise<({ vehicleId: string } & Figures)[]> {
    if (!vehicleIds.length) return [];
    const marks = vehicleIds.map(() => "?").join(", ");
    const { results } = await this.db
      .prepare(
        `SELECT vehicle_id, SUM(distance_m) AS distance_m, SUM(driving_s) AS driving_s,
           MAX(max_speed) AS max_speed, SUM(trips) AS trips, SUM(fuel_used_l) AS fuel_used_l,
           SUM(records) AS records, COUNT(*) AS days
         FROM days WHERE vehicle_id IN (${marks}) ${from ? "AND day >= ?" : ""}
         GROUP BY vehicle_id`,
      )
      .bind(...vehicleIds, ...(from ? [from] : []))
      .all<{
        vehicle_id: string;
        distance_m: number;
        driving_s: number;
        max_speed: number;
        trips: number;
        fuel_used_l: number | null;
        records: number;
        days: number;
      }>();
    return results.map((row) => ({
      vehicleId: row.vehicle_id,
      distanceM: row.distance_m,
      drivingS: row.driving_s,
      maxSpeed: row.max_speed,
      trips: row.trips,
      fuelUsedL: row.fuel_used_l,
      records: row.records,
      days: row.days,
    }));
  }
}
