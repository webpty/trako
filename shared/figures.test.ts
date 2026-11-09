import { describe, expect, it } from "vitest";
import { dayFigures, haversineM, type Point } from "./figures";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 9, 8, minute)).toISOString();
const point = (minute: number, lat: number, extra: Partial<Point> = {}): Point => ({
  at: at(minute),
  lat,
  lon: 2.35,
  speed: 50,
  satellites: 10,
  ignition: 1,
  fuelL: null,
  ...extra,
});

describe("a day's figures", () => {
  it("measures a degree of latitude as about 111 km", () => {
    expect(haversineM({ lat: 48, lon: 2 }, { lat: 49, lon: 2 })).toBeGreaterThan(111_000);
    expect(haversineM({ lat: 48, lon: 2 }, { lat: 49, lon: 2 })).toBeLessThan(111_400);
  });

  it("adds distance and driving time along one trip", () => {
    const figures = dayFigures([point(0, 48.85), point(1, 48.86), point(2, 48.87, { ignition: 0, speed: 0 })]);
    expect(figures.trips).toBe(1);
    expect(figures.drivingS).toBe(120);
    expect(figures.distanceM).toBeGreaterThan(2_200);
    expect(figures.distanceM).toBeLessThan(2_250);
    expect(figures.maxSpeed).toBe(50);
  });

  it("counts a second trip after the ignition was off", () => {
    const figures = dayFigures([
      point(0, 48.85),
      point(1, 48.86, { ignition: 0, speed: 0 }),
      point(30, 48.86, { ignition: 0, speed: 0 }),
      point(31, 48.87),
      point(32, 48.88, { ignition: 0, speed: 0 }),
    ]);
    expect(figures.trips).toBe(2);
    expect(figures.drivingS).toBe(120);
  });

  it("does not count a trip carried over from the day before", () => {
    const yesterday = { ...point(0, 48.85), at: "2026-11-08T23:59:00.000Z" };
    expect(dayFigures([{ ...point(0, 48.86), at: "2026-11-09T00:00:30.000Z" }], yesterday).trips).toBe(0);
  });

  it("ignores a jump no car could make, and fixes without satellites", () => {
    const figures = dayFigures([point(0, 48.85), point(1, 50), point(2, 0, { lon: 0, satellites: 0, speed: 250 })]);
    expect(figures.distanceM).toBe(0);
    expect(figures.maxSpeed).toBe(50);
  });

  it("does not count a long gap as driving", () => {
    expect(dayFigures([point(0, 48.85), point(40, 48.86)]).drivingS).toBe(0);
  });

  it("counts fuel used per trip and ignores a refuel", () => {
    const figures = dayFigures([
      point(0, 48.85, { fuelL: 50 }),
      point(1, 48.86, { fuelL: 48.5 }),
      point(2, 48.87, { fuelL: 48, ignition: 0, speed: 0 }),
      point(20, 48.87, { fuelL: 70, ignition: 0, speed: 0 }),
      point(21, 48.88, { fuelL: 70 }),
      point(22, 48.89, { fuelL: 69, ignition: 0, speed: 0 }),
    ]);
    expect(figures.fuelUsedL).toBe(3);
  });

  it("says nothing about fuel when no record has litres", () => {
    expect(dayFigures([point(0, 48.85), point(1, 48.86)]).fuelUsedL).toBeNull();
  });
});
