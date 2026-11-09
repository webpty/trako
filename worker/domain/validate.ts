// What arrives over the wire is only ever a guess until it has been through
// here.

import type { DateOrder } from "../../shared/types";

const DATE_ORDERS: readonly DateOrder[] = ["dmmmy", "dmy", "mdy", "ymd"];

export const isDateOrder = (v: unknown): v is DateOrder =>
  typeof v === "string" && (DATE_ORDERS as readonly string[]).includes(v);

/** A line of text as it should be stored: trimmed, capped, and null rather
    than an empty string. */
export function text(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed ? trimmed : null;
}

export function looksLikeEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
