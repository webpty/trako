// One vehicle's figures for one day, worked out from its records.
//
// Kept apart from the database so the rules can be read and tested on their
// own. A trip, until trip detection is built, is one stretch with the ignition
// on.

export interface Point {
  at: string;
  lat: number;
  lon: number;
  speed: number;
  satellites: number;
  ignition: number | null;
  fuelL: number | null;
}

export interface DayFigures {
  distanceM: number;
  drivingS: number;
  maxSpeed: number;
  trips: number;
  fuelUsedL: number | null;
  records: number;
}

/** A gap longer than this is the tracker asleep or out of reach, not driving. */
const LONGEST_GAP_S = 10 * 60;
/** A jump faster than this between two fixes is a bad fix, not a journey. */
const FASTEST_KMH = 300;

export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A fix the tracker had satellites for, and not the 0,0 it sends without. */
export function goodFix(point: Pick<Point, "lat" | "lon" | "satellites">): boolean {
  return point.satellites >= 3 && !(point.lat === 0 && point.lon === 0);
}

function driving(point: Point): boolean {
  return point.ignition === null ? point.speed > 3 : point.ignition === 1;
}

/**
 * The figures for `points`, oldest first. `before` is the last record before
 * them, if any, so a trip that began yesterday is not counted again today.
 */
export function dayFigures(points: Point[], before: Point | null = null): DayFigures {
  let distanceM = 0;
  let drivingS = 0;
  let maxSpeed = 0;
  let trips = 0;
  let fuelUsedL: number | null = null;
  let tripFuelStart: number | null = null;
  let lastFuel: number | null = null;

  const closeTrip = () => {
    if (tripFuelStart !== null && lastFuel !== null && tripFuelStart > lastFuel) {
      fuelUsedL = (fuelUsedL ?? 0) + (tripFuelStart - lastFuel);
    } else if (tripFuelStart !== null && fuelUsedL === null) {
      fuelUsedL = 0;
    }
    tripFuelStart = null;
  };

  let previous = before;
  let inTrip = before ? driving(before) : false;
  if (inTrip && before?.fuelL != null) tripFuelStart = before.fuelL;

  for (const point of points) {
    const gapS = previous ? (Date.parse(point.at) - Date.parse(previous.at)) / 1000 : Infinity;
    const joined = gapS <= LONGEST_GAP_S;
    const now = driving(point);

    if (now && (!inTrip || !joined)) {
      if (inTrip) closeTrip();
      trips++;
      inTrip = true;
      tripFuelStart = point.fuelL;
    } else if (!now && inTrip) {
      lastFuel = point.fuelL ?? lastFuel;
      closeTrip();
      inTrip = false;
    }

    if (previous && joined && gapS > 0) {
      if (driving(previous)) drivingS += gapS;
      if (goodFix(previous) && goodFix(point)) {
        const metres = haversineM(previous, point);
        if ((metres / gapS) * 3.6 <= FASTEST_KMH) distanceM += metres;
      }
    }
    if (goodFix(point)) maxSpeed = Math.max(maxSpeed, point.speed);
    if (point.fuelL !== null) lastFuel = point.fuelL;
    if (inTrip && tripFuelStart === null) tripFuelStart = point.fuelL;
    previous = point;
  }
  if (inTrip) closeTrip();

  return {
    distanceM: Math.round(distanceM),
    drivingS: Math.round(drivingS),
    maxSpeed,
    trips,
    fuelUsedL: fuelUsedL === null ? null : Math.round((fuelUsedL as number) * 10) / 10,
    records: points.length,
  };
}

/** The UTC day a moment falls on, as YYYY-MM-DD. */
export function dayOf(at: string): string {
  return at.slice(0, 10);
}
