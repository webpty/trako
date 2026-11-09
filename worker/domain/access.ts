// Who sees what. The admin sees every vehicle; anybody else, the vehicles
// given to them and nothing more.

import type { Vehicle } from "../../shared/types";
import type { App } from "../app";
import type { Person } from "../ports";

export async function visibleVehicles(app: App, person: Person): Promise<Vehicle[]> {
  const all = await app.vehicles.all();
  return person.role === "admin" ? all : all.filter((vehicle) => vehicle.personId === person.id);
}

export async function canSee(app: App, person: Person, vehicleId: string): Promise<boolean> {
  return (await visibleVehicles(app, person)).some((vehicle) => vehicle.id === vehicleId);
}
