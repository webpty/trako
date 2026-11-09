// Everything the page asks the Worker for. One place, so a failure is reported
// the same way wherever it happens rather than disappearing.

import type {
  Dashboard,
  DashboardPeriod,
  MapTrack,
  Me,
  Person,
  SettingsPatch,
  StoredRecord,
  Tracker,
  Vehicle,
} from "../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: init?.body instanceof Blob ? (init?.headers ?? {}) : { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("The site could not be reached.", 0);
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? "Something went wrong.", response.status);
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const api = {
  state: () => call<{ me: Me | null }>("/api/state"),
  askForCode: (email: string) => call<{ ok: true }>("/api/sign-in/code", send("POST", { email })),
  signIn: (email: string, code: string) => call<{ me: Me }>("/api/sign-in/verify", send("POST", { email, code })),
  signOut: () => call<void>("/api/sign-out", send("POST")),

  saveSettings: (patch: SettingsPatch) => call<{ me: Me }>("/api/me", send("PATCH", patch)),
  savePhoto: async (blob: Blob) =>
    (await call<{ me: Me }>("/api/me/photo", { method: "PUT", body: blob, headers: { "content-type": blob.type } })).me,
  removePhoto: () => call<{ me: Me }>("/api/me/photo", send("DELETE")),

  vehicles: () => call<{ vehicles: Vehicle[] }>("/api/vehicles"),
  map: (from: string, to: string | undefined) =>
    call<{ tracks: MapTrack[] }>(`/api/map?${new URLSearchParams({ from, ...(to ? { to } : {}) })}`),
  records: (which: { vehicle: string } | { imei: string }, before: number | null) =>
    call<{ records: StoredRecord[]; more: boolean }>(
      `/api/records?${new URLSearchParams({ ...which, ...(before ? { before: String(before) } : {}) })}`,
    ),
  dashboard: (vehicle: string, period: DashboardPeriod) =>
    call<Dashboard>(`/api/dashboard?${new URLSearchParams({ vehicle, period })}`),

  people: () => call<{ people: Person[] }>("/api/people"),
  addPerson: (name: string, email: string) => call<{ people: Person[] }>("/api/people", send("POST", { name, email })),
  removePerson: (id: string) => call<{ people: Person[] }>(`/api/people/${encodeURIComponent(id)}`, send("DELETE")),
  assignVehicle: (id: string, personId: string | null) =>
    call<{ vehicles: Vehicle[] }>(`/api/vehicles/${encodeURIComponent(id)}`, send("PATCH", { personId })),
  trackers: () => call<{ trackers: Tracker[] }>("/api/trackers"),
  placeTracker: (imei: string, vehicleId: string | null) =>
    call<{ trackers: Tracker[]; vehicles: Vehicle[] }>(`/api/trackers/${encodeURIComponent(imei)}`, send("PATCH", { vehicleId })),
};
