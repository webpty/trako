// beary's periods, copied as they are there: how far back the map reaches.
// The two years are calendar years, since that is how a person thinks of a
// year when looking back.

/** Every period there is, in the order they read. */
export const ALL_PERIODS = [
  { id: "30", label: "30 days" },
  { id: "90", label: "3 months" },
  { id: "180", label: "6 months" },
  { id: "year", label: "This year" },
  { id: "last", label: "Last year" },
  { id: "all", label: "Everything" },
] as const;

export type PeriodId = (typeof ALL_PERIODS)[number]["id"];

export function isPeriodId(value: unknown): value is PeriodId {
  return ALL_PERIODS.some((one) => one.id === value);
}

const DAY = 86_400_000;

export function periodFrom(period: PeriodId, now = new Date()): string {
  switch (period) {
    case "30":
      return new Date(now.getTime() - 30 * DAY).toISOString();
    case "90":
      return new Date(now.getTime() - 90 * DAY).toISOString();
    case "180":
      return new Date(now.getTime() - 180 * DAY).toISOString();
    case "year":
      return `${now.getUTCFullYear()}-01-01T00:00:00.000Z`;
    case "last":
      return `${now.getUTCFullYear() - 1}-01-01T00:00:00.000Z`;
    case "all":
      return "1970-01-01T00:00:00.000Z";
  }
}

/** Where the period stops, which only a past year says. */
export function periodTo(period: PeriodId, now = new Date()): string | undefined {
  return period === "last" ? `${now.getUTCFullYear() - 1}-12-31T23:59:59.999Z` : undefined;
}
