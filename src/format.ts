// Dates and times, written the way the reader asked for them.
//
// The order is picked apart and put back rather than left to a locale: a locale
// decides the order as a side effect of the language, and the two are separate
// choices here.

import type { DateOrder, Me } from "../shared/types";

export interface Preferences {
  dateOrder: DateOrder;
  clock24h: boolean;
  timeZone: string;
  /** Which language a month is named in, where the format uses a name. */
  language: string;
}

/** Their settings, with whatever this browser can work out standing in for
    anything missing. */
export function preferences(me: Me | null): Preferences {
  return {
    dateOrder: me?.dateOrder ?? "dmy",
    clock24h: me?.clock24h ?? true,
    timeZone: me?.timeZone || here(),
    language: me?.language || "en",
  };
}

export function here(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function formatDate(at: string | Date, how: Preferences): string {
  // A plain day is the same day everywhere, so it is not moved into a zone.
  const plain = typeof at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(at);
  const { day, month, year, named } = pieces(at, plain ? "UTC" : how.timeZone, how.language);
  if (how.dateOrder === "dmmmy") return `${day} ${named} ${year}`;
  if (how.dateOrder === "mdy") return `${month}/${day}/${year}`;
  if (how.dateOrder === "ymd") return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}

export function formatTime(at: string | Date, how: Preferences): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: how.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: !how.clock24h,
  }).format(new Date(at));
}

export function formatDateTime(at: string | Date, how: Preferences): string {
  return `${formatDate(at, how)} ${formatTime(at, how)}`;
}

/** A sample of what an order looks like, for choosing between them. */
export function sample(order: DateOrder, how: Preferences): string {
  return formatDate("2026-12-31", { ...how, dateOrder: order });
}

/** How long ago, in words. Paired with the full date wherever it matters, so a
    vague phrase is never the only thing on offer. */
export function ago(at: string | Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(at).getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** Every zone the browser knows, or at least the one it is in. */
export function zones(): string[] {
  const all = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  try {
    const list = all?.("timeZone");
    if (list?.length) return list;
  } catch {
    // Older browsers will not say. The one we are in is better than nothing.
  }
  return [here()];
}

function pieces(at: string | Date, timeZone: string, language: string) {
  const when = new Date(at);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(when);
  const find = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const named = new Intl.DateTimeFormat(language, { timeZone, month: "short" })
    .format(when)
    .replace(/\.$/, "");
  return { day: find("day"), month: find("month"), year: find("year"), named };
}
