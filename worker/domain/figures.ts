// The days with new records, worked out again. Run by the timer, and before
// the dashboard is read so it is never behind what has arrived.

import { dayFigures } from "../../shared/figures";
import type { App } from "../app";

export async function refreshDays(app: App, most = 40): Promise<number> {
  const dirty = await app.days.dirty(most);
  for (const { vehicleId, day } of dirty) {
    const { points, before } = await app.records.day(vehicleId, day);
    await app.days.save(vehicleId, day, dayFigures(points, before));
  }
  return dirty.length;
}
