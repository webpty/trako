// Everything the page asks for, and the relay's way in. Public routes first,
// then the ones that need a session: nothing below the guard can be reached
// without one, and nothing below the admin guard without the admin.

import type { DashboardPeriod, Figures, Me, Person as PersonDto } from "../../shared/types";
import { build, type App } from "../app";
import { canSee, visibleVehicles } from "../domain/access";
import { refreshDays } from "../domain/figures";
import { ingest, isBatch } from "../domain/ingest";
import { addOptions, signInOptions, verifyAdd, verifySignIn } from "../domain/passkeys";
import { redeemCode, requestCode, startSession } from "../domain/signin";
import { id as makeId } from "../domain/tokens";
import { isDateOrder, looksLikeEmail, text } from "../domain/validate";
import type { Person } from "../ports";
import { clearSession, readSession, setSession } from "./cookies";
import { body, fail, json, noContent } from "./json";

function asMe(person: Person): Me {
  return {
    id: person.id,
    email: person.email,
    name: person.name,
    role: person.role,
    photoKey: person.photoKey,
    country: person.country,
    language: person.language,
    languageChosen: person.languageChosen,
    dateOrder: person.dateOrder,
    clock24h: person.clock24h,
    timeZone: person.timeZone,
  };
}

function asPerson(person: Person): PersonDto {
  return { id: person.id, email: person.email, name: person.name, role: person.role, photoKey: person.photoKey };
}

/** The most points one vehicle's track carries to the map. */
const TRACK_POINTS = 4000;
const PAGE_SIZE = 200;

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const app = build(env);
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  const path = url.pathname.split("/").filter(Boolean).slice(1);
  const method = request.method;
  const at = (i: number) => path[i] ?? "";

  // The relay, with its own key rather than a session.
  if (method === "POST" && at(0) === "ingest" && path.length === 1) {
    if (!app.ingestSecret || !(await sameSecret(request.headers.get("authorization"), `Bearer ${app.ingestSecret}`))) {
      return fail("Not the relay.", 401);
    }
    const input = await body<{ batches?: unknown[] }>(request);
    if (!Array.isArray(input?.batches)) return fail("No batches.");
    const batches = input.batches.filter(isBatch);
    return json(await ingest(app, batches));
  }

  if (method === "GET" && at(0) === "state" && path.length === 1) {
    const sessionId = readSession(request);
    const person = sessionId ? await app.sessions.personFor(sessionId, app.clock.now().toISOString()) : null;
    return json({ me: person ? asMe(person) : null });
  }

  if (method === "POST" && at(0) === "sign-in" && at(1) === "code") {
    if (!(await allowed(env, request))) return fail("Too many tries. Wait a minute.", 429);
    const input = await body<{ email: string }>(request);
    if (!input?.email) return fail("An e-mail address is needed.");
    const outcome = await requestCode(app, input.email);
    if (outcome === "too-many") return fail("Three codes in ten minutes is the limit.", 429);
    return json({ ok: true });
  }

  if (method === "POST" && at(0) === "sign-in" && at(1) === "verify") {
    if (!(await allowed(env, request))) return fail("Too many tries. Wait a minute.", 429);
    const input = await body<{ email: string; code: string }>(request);
    if (!input?.email || !input?.code) return fail("An e-mail address and a code are needed.");
    const outcome = await redeemCode(app, input.email, input.code);
    if (outcome === "locked") return fail("Too many wrong codes. Try again in a quarter of an hour.", 429);
    if (outcome === "wrong") return fail("That code is wrong, or it has expired.", 401);
    const person = await app.people.byEmail(input.email);
    if (!person) return fail("That code is wrong, or it has expired.", 401);
    return json(
      { me: asMe(person) },
      { headers: { "set-cookie": setSession(outcome.sessionId, outcome.expiresAt, secure) } },
    );
  }

  if (method === "POST" && at(0) === "passkeys" && at(1) === "sign-in" && at(2) === "options") {
    return json(await signInOptions(app, url.origin));
  }

  if (method === "POST" && at(0) === "passkeys" && at(1) === "sign-in" && path.length === 2) {
    if (!(await allowed(env, request))) return fail("Too many tries. Wait a minute.", 429);
    const response = await body<Parameters<typeof verifySignIn>[2]>(request);
    if (!response) return fail("That passkey was not recognised.", 401);
    const person = await verifySignIn(app, url.origin, response);
    if (!person) return fail("That passkey was not recognised.", 401);
    const session = await startSession(app, person.id);
    return json(
      { me: asMe(person) },
      { headers: { "set-cookie": setSession(session.sessionId, session.expiresAt, secure) } },
    );
  }

  // Everything past here needs a session.
  const sessionId = readSession(request);
  const me = sessionId ? await app.sessions.personFor(sessionId, app.clock.now().toISOString()) : null;
  if (!me) return fail("Sign in first.", 401);

  if (method === "POST" && at(0) === "sign-out") {
    await app.sessions.destroy(sessionId!);
    return noContent({ "set-cookie": clearSession(secure) });
  }

  if (at(0) === "me" && path.length === 1) {
    if (method === "GET") return json({ me: asMe(me) });
    if (method === "PATCH") return saveSettings(app, me, request);
  }

  if (at(0) === "me" && at(1) === "photo") {
    if (method === "PUT") return putPhoto(app, me, request);
    if (method === "DELETE") return removePhoto(app, me);
    if (method === "GET") return getPhoto(app, me);
  }

  if (at(0) === "passkeys") {
    if (method === "GET" && path.length === 1) {
      const keys = await app.passkeys.forPerson(me.id);
      return json({ keys: keys.map((key) => ({ id: key.id, label: key.label })) });
    }
    if (method === "POST" && at(1) === "options") return json(await addOptions(app, url.origin, me));
    if (method === "POST" && path.length === 1) {
      const input = await body<{ response: Parameters<typeof verifyAdd>[3]; label?: string }>(request);
      if (!input?.response) return fail("That passkey could not be added.");
      const ok = await verifyAdd(app, url.origin, me, input.response, text(input.label, 60));
      return ok ? noContent() : fail("That passkey could not be added.");
    }
    if (method === "DELETE" && path.length === 2) {
      await app.passkeys.remove(decodeURIComponent(at(1)), me.id);
      return noContent();
    }
  }

  if (method === "GET" && at(0) === "vehicles" && path.length === 1) {
    return json({ vehicles: await visibleVehicles(app, me) });
  }

  // Each vehicle's track between two moments, for the map.
  if (method === "GET" && at(0) === "map" && path.length === 1) {
    const from = moment(url.searchParams.get("from")) ?? "1970-01-01T00:00:00.000Z";
    const to = moment(url.searchParams.get("to")) ?? "9999-12-31T23:59:59.999Z";
    const vehicles = await visibleVehicles(app, me);
    const tracks = await Promise.all(vehicles.map((vehicle) => app.records.track(vehicle.id, from, to, TRACK_POINTS)));
    return json({ tracks });
  }

  // Every record, newest first, a page at a time. The admin may also read a
  // tracker that is in no vehicle yet, by its IMEI.
  if (method === "GET" && at(0) === "records" && path.length === 1) {
    const vehicleId = url.searchParams.get("vehicle");
    const imei = url.searchParams.get("imei");
    const before = Number(url.searchParams.get("before"));
    if (vehicleId) {
      if (!(await canSee(app, me, vehicleId))) return fail("No such vehicle.", 404);
    } else if (!imei || me.role !== "admin") {
      return fail("Choose a vehicle.");
    }
    const records = await app.records.page(
      vehicleId ? { vehicleId } : { imei: imei! },
      Number.isInteger(before) && before > 0 ? before : null,
      PAGE_SIZE,
    );
    return json({ records, more: records.length === PAGE_SIZE });
  }

  if (method === "GET" && at(0) === "dashboard" && path.length === 1) {
    const period = url.searchParams.get("period") as DashboardPeriod | null;
    const wanted = url.searchParams.get("vehicle");
    const vehicles = await visibleVehicles(app, me);
    const ids = vehicles.map((v) => v.id).filter((id) => !wanted || wanted === "all" || id === wanted);
    // Whatever has arrived since the timer last ran is counted now.
    await refreshDays(app, 200);
    const rows = await app.days.totals(ids, periodStart(period ?? "all", app.clock.now()));
    return json({ total: sum(rows), vehicles: rows });
  }

  // The admin's pages: people, and which vehicle each tracker is in.
  if (me.role !== "admin") return fail("No such thing here.", 404);

  if (at(0) === "people") {
    if (method === "GET" && path.length === 1) {
      return json({ people: (await app.people.all()).map(asPerson) });
    }
    if (method === "POST" && path.length === 1) {
      const input = await body<{ name?: string; email?: string }>(request);
      const name = text(input?.name, 80);
      if (!name) return fail("A name is needed.");
      if (!looksLikeEmail(input?.email)) return fail("That e-mail address does not look right.");
      if (await app.people.byEmail(input.email)) return fail("That e-mail address is already on the list.", 409);
      await app.people.add(
        {
          id: makeId(app.random),
          email: input.email,
          name,
          role: "user",
          timeZone: me.timeZone,
          dateOrder: me.dateOrder,
          clock24h: me.clock24h,
        },
        app.clock.now().toISOString(),
      );
      return json({ people: (await app.people.all()).map(asPerson) });
    }
    if (method === "DELETE" && path.length === 2) {
      if (at(1) === me.id) return fail("You cannot remove yourself.");
      const person = await app.people.byId(at(1));
      if (!person) return fail("No such person.", 404);
      for (const vehicle of await app.vehicles.all()) {
        if (vehicle.personId === person.id) await app.vehicles.assign(vehicle.id, null);
      }
      if (person.photoKey) await app.media.delete(person.photoKey).catch(() => {});
      await app.people.remove(person.id);
      return json({ people: (await app.people.all()).map(asPerson) });
    }
  }

  if (method === "PATCH" && at(0) === "vehicles" && path.length === 2) {
    const vehicle = await app.vehicles.byId(at(1));
    if (!vehicle) return fail("No such vehicle.", 404);
    const input = await body<{ personId?: string | null }>(request);
    if (input?.personId === undefined) return fail("Nothing to change.");
    if (input.personId !== null && !(await app.people.byId(input.personId))) return fail("No such person.", 404);
    await app.vehicles.assign(vehicle.id, input.personId);
    return json({ vehicles: await app.vehicles.all() });
  }

  if (method === "GET" && at(0) === "trackers" && path.length === 1) {
    return json({ trackers: await app.trackers.all() });
  }

  if (method === "PATCH" && at(0) === "trackers" && path.length === 2) {
    const input = await body<{ vehicleId?: string | null }>(request);
    if (input?.vehicleId === undefined) return fail("Nothing to change.");
    if (input.vehicleId !== null && !(await app.vehicles.byId(input.vehicleId))) return fail("No such vehicle.", 404);
    if (!(await app.trackers.place(decodeURIComponent(at(1)), input.vehicleId))) return fail("No such tracker.", 404);
    await refreshDays(app, 200);
    return json({ trackers: await app.trackers.all(), vehicles: await app.vehicles.all() });
  }

  return fail("No such thing here.", 404);
}

/** Compared in full whatever the first difference, so the time taken says
    nothing about how much of the key was right. */
async function sameSecret(given: string | null, expected: string): Promise<boolean> {
  if (!given) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(given)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

function moment(value: string | null): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

/** The first day a dashboard period counts, as YYYY-MM-DD; null for all. */
export function periodStart(period: DashboardPeriod, now: Date): string | null {
  const day = (when: Date) => when.toISOString().slice(0, 10);
  if (period === "year") return `${now.getUTCFullYear()}-01-01`;
  if (period === "90") return day(new Date(now.getTime() - 90 * 86_400_000));
  if (period === "30") return day(new Date(now.getTime() - 30 * 86_400_000));
  return null;
}

function sum(rows: Figures[]): Figures {
  const fuel = rows.filter((row) => row.fuelUsedL !== null);
  return {
    distanceM: rows.reduce((n, row) => n + row.distanceM, 0),
    drivingS: rows.reduce((n, row) => n + row.drivingS, 0),
    maxSpeed: rows.reduce((n, row) => Math.max(n, row.maxSpeed), 0),
    trips: rows.reduce((n, row) => n + row.trips, 0),
    fuelUsedL: fuel.length ? fuel.reduce((n, row) => n + (row.fuelUsedL ?? 0), 0) : null,
    records: rows.reduce((n, row) => n + row.records, 0),
    days: rows.reduce((n, row) => Math.max(n, row.days), 0),
  };
}

async function allowed(env: Env, request: Request): Promise<boolean> {
  if (!env.SIGN_IN_LIMIT) return true;
  const key = request.headers.get("cf-connecting-ip") ?? "nobody";
  const { success } = await env.SIGN_IN_LIMIT.limit({ key });
  return success;
}

async function saveSettings(app: App, me: Person, request: Request): Promise<Response> {
  const input = await body<Record<string, unknown>>(request);
  if (!input) return fail("Nothing to change.");
  const patch: Partial<Me> = {};

  if (input.name !== undefined) {
    const name = text(input.name, 80);
    if (!name) return fail("A name is needed.");
    patch.name = name;
  }
  if (input.country !== undefined) patch.country = text(input.country, 2);
  if (input.language !== undefined) {
    const language = text(input.language, 5);
    if (!language) return fail("That is not a language.");
    patch.language = language;
    // A language only counts as chosen when it is chosen here, which keeps a
    // default apart from a decision.
    patch.languageChosen = true;
  }
  if (input.dateOrder !== undefined) {
    if (!isDateOrder(input.dateOrder)) return fail("That is not a way to write a date.");
    patch.dateOrder = input.dateOrder;
  }
  if (input.clock24h !== undefined) patch.clock24h = !!input.clock24h;
  if (input.timeZone !== undefined) {
    const zone = text(input.timeZone, 60);
    if (!zone || !zoneExists(zone)) return fail("That is not a time zone.");
    patch.timeZone = zone;
  }

  await app.people.update(me.id, patch);
  const fresh = await app.people.byId(me.id);
  return fresh ? json({ me: asMe(fresh) }) : fail("Could not save that.", 500);
}

function zoneExists(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Already square and small: the browser cuts and shrinks it before it comes. */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_LIMIT = 1_000_000;

async function putPhoto(app: App, me: Person, request: Request): Promise<Response> {
  const type = request.headers.get("content-type")?.split(";")[0] ?? "";
  if (!PHOTO_TYPES.includes(type)) return fail("That is not a picture the site can take.");
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return fail("That picture is empty.");
  if (bytes.byteLength > PHOTO_LIMIT) return fail("That picture is too big.");

  const key = `photos/${me.id}/${makeId(app.random)}`;
  await app.media.put(key, bytes, type);
  await app.people.update(me.id, { photoKey: key });
  // The one that was there is deleted, not left behind.
  if (me.photoKey) await app.media.delete(me.photoKey).catch(() => {});
  const fresh = await app.people.byId(me.id);
  return fresh ? json({ me: asMe(fresh) }) : fail("Could not save that.", 500);
}

async function getPhoto(app: App, me: Person): Promise<Response> {
  if (!me.photoKey) return fail("No picture.", 404);
  const object = await app.media.get(me.photoKey);
  if (!object) return fail("No picture.", 404);
  return new Response(object.body, {
    headers: { "content-type": object.contentType, "cache-control": "private, max-age=31536000, immutable" },
  });
}

async function removePhoto(app: App, me: Person): Promise<Response> {
  if (me.photoKey) await app.media.delete(me.photoKey).catch(() => {});
  await app.people.update(me.id, { photoKey: null });
  const fresh = await app.people.byId(me.id);
  return fresh ? json({ me: asMe(fresh) }) : fail("Could not save that.", 500);
}
