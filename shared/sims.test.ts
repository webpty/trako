import { describe, expect, it } from "vitest";
import { iccidParts, sameSim } from "./sims";

describe("which SIM a tracker holds", () => {
  // The halves in Teltonika's own Codec 8 Extended example.
  it("reads the two halves the tracker sends", () => {
    expect(iccidParts({ 11: 893700218, 14: 500686954, 16: 1 })).toBe("893700218,500686954");
    expect(iccidParts({ 16: 1 })).toBeNull();
  });

  it("matches a SIM whose ICCID starts with the two halves", () => {
    expect(sameSim("8937002185006869547", "893700218,500686954")).toBe(true);
  });

  it("allows for zeros a number cannot carry at the start of the second half", () => {
    expect(sameSim("8944501600042514531", "894450160,42514531")).toBe(true);
  });

  it("does not match another SIM", () => {
    expect(sameSim("8944501604251453167", "894450160,4251453175")).toBe(false);
    expect(sameSim("8944501604251453175", null)).toBe(false);
  });
});
