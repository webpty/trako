// Records arriving from the relay. Each tracker is registered the first time
// it is seen, its records are kept once each under the vehicle it is in, and
// the days they fall on are marked for their figures to be worked out again.

import { dayOf } from "../../shared/figures";
import { iccidParts } from "../../shared/sims";
import type { IncomingBatch, IncomingRecord } from "../../shared/types";
import type { App } from "../app";

export interface IngestOutcome {
  batches: number;
  records: number;
  added: number;
}

export async function ingest(app: App, batches: IncomingBatch[]): Promise<IngestOutcome> {
  let records = 0;
  let added = 0;
  for (const batch of batches) {
    const good = batch.records.filter(wellFormed);
    records += good.length;
    if (!good.length) continue;
    // Seen when the relay took it, not when the oldest record in it was made:
    // a tracker back in range sends a day's records at once.
    const vehicleId = await app.trackers.seen(batch.imei, batch.receivedAt);
    added += await app.records.add(batch.imei, vehicleId, batch.receivedAt, good);
    // The SIM inside it, from the newest record that says.
    const parts = [...good].sort((a, b) => b.at.localeCompare(a.at)).map((r) => iccidParts(r.io)).find(Boolean);
    if (parts) await app.trackers.noteSim(batch.imei, parts);
    if (vehicleId) {
      const days = [...new Set(good.map((r) => dayOf(r.at)))];
      await app.days.markDirty(days.map((day) => ({ vehicleId, day })));
    }
  }
  return { batches: batches.length, records, added };
}

/** The shape the relay sends. Anything else is dropped rather than written. */
export function isBatch(value: unknown): value is IncomingBatch {
  const batch = value as IncomingBatch;
  return (
    !!batch &&
    typeof batch.imei === "string" &&
    /^\d{8,20}$/.test(batch.imei) &&
    typeof batch.receivedAt === "string" &&
    Array.isArray(batch.records)
  );
}

function wellFormed(r: IncomingRecord): boolean {
  return (
    typeof r?.at === "string" &&
    !Number.isNaN(Date.parse(r.at)) &&
    [r.priority, r.lat, r.lon, r.altitude, r.heading, r.satellites, r.speed, r.eventIo].every(Number.isFinite) &&
    typeof r.io === "object" &&
    r.io !== null
  );
}
