-- The SIM cards, by ICCID, with the number they answer on. Which tracker a SIM
-- is in is not kept here: the tracker reports its SIM's ICCID (IO 11 and 14),
-- that is kept on the tracker, and the two are matched when the page is read.
CREATE TABLE sims (
  iccid      TEXT PRIMARY KEY,
  msisdn     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- The two halves of the ICCID as the tracker last sent them, "part1,part2".
ALTER TABLE trackers ADD COLUMN iccid_parts TEXT;

-- The first three Things Mobile SIMs (9 Nov 2026).
INSERT INTO sims (iccid, msisdn, created_at) VALUES
  ('8944501604251453159', '882360027928125', '2026-11-09T20:00:00.000Z'),
  ('8944501604251453167', '882360027928126', '2026-11-09T20:00:00.000Z'),
  ('8944501604251453175', '882360027928127', '2026-11-09T20:00:00.000Z');
