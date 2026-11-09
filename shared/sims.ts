// Which SIM a tracker holds. Teltonika sends the ICCID in two halves, IO 11
// and IO 14, each as a number; written out and put side by side they are the
// start of the ICCID. A number drops the leading zeros of the second half, and
// the tracker may leave off the last digit, so the match allows for both.

import { IO } from "./io";

/** "part1,part2" from a record's IO values, or null when it has neither. */
export function iccidParts(io: Record<string, number | string>): string | null {
  const one = io[IO.iccid1];
  const two = io[IO.iccid2];
  if (one === undefined || two === undefined) return null;
  return `${one},${two}`;
}

export function sameSim(iccid: string, parts: string | null): boolean {
  if (!parts) return false;
  const [one, two] = parts.split(",");
  if (!one || !two || !iccid.startsWith(one)) return false;
  const rest = iccid.slice(one.length).replace(/^0+/, "");
  return rest.startsWith(two.replace(/^0+/, ""));
}
