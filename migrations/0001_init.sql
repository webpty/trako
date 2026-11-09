-- People, sign-in, vehicles, trackers and every record the trackers send.

-- The allow-list. An address not here cannot sign in. The admin sees every
-- vehicle and hands them out; a user sees the vehicles given to them.
CREATE TABLE people (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'user',
  photo_key       TEXT,
  country         TEXT,
  language        TEXT,
  language_chosen INTEGER NOT NULL DEFAULT 0,
  date_order      TEXT NOT NULL DEFAULT 'dmy',
  clock_24h       INTEGER NOT NULL DEFAULT 1,
  time_zone       TEXT NOT NULL DEFAULT 'America/Panama',
  created_at      TEXT NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX sessions_expires ON sessions(expires_at);

-- Codes are kept as a hash, so the table is of no use to anybody who reads it.
CREATE TABLE codes (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX codes_email ON codes(email, created_at);

CREATE TABLE sign_in_tries (
  email TEXT NOT NULL,
  at    TEXT NOT NULL
);

CREATE INDEX sign_in_tries_email ON sign_in_tries(email, at);

CREATE TABLE challenges (
  id         TEXT PRIMARY KEY,
  purpose    TEXT NOT NULL,
  person_id  TEXT REFERENCES people(id) ON DELETE CASCADE,
  value      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX challenges_value ON challenges(value);

CREATE TABLE passkeys (
  id           TEXT PRIMARY KEY,
  person_id    TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  public_key   TEXT NOT NULL,
  counter      INTEGER NOT NULL DEFAULT 0,
  transports   TEXT,
  label        TEXT,
  created_at   TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX passkeys_person ON passkeys(person_id);

-- A car. Given to one person, or to nobody yet.
CREATE TABLE vehicles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  region     TEXT,
  tracker    TEXT,
  colour     TEXT NOT NULL,
  person_id  TEXT REFERENCES people(id) ON DELETE SET NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- A tracker, known by its IMEI from the first time it connects. Unassigned
-- until the admin puts it in a vehicle.
CREATE TABLE trackers (
  imei          TEXT PRIMARY KEY,
  vehicle_id    TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE INDEX trackers_vehicle ON trackers(vehicle_id);

-- Every record a tracker sent, exactly as decoded. The vehicle is the one the
-- tracker was in when the record arrived, so moving a tracker to another car
-- never rewrites where it has been. `io` holds every IO and OBD value by its
-- Teltonika number; the common ones are copied into columns as well.
CREATE TABLE records (
  id          INTEGER PRIMARY KEY,
  imei        TEXT NOT NULL,
  vehicle_id  TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  at          TEXT NOT NULL,
  received_at TEXT NOT NULL,
  priority    INTEGER NOT NULL,
  lat         REAL NOT NULL,
  lon         REAL NOT NULL,
  altitude    INTEGER NOT NULL,
  heading     INTEGER NOT NULL,
  satellites  INTEGER NOT NULL,
  speed       INTEGER NOT NULL,
  event_io    INTEGER NOT NULL,
  ignition    INTEGER,
  movement    INTEGER,
  odometer_m  INTEGER,
  fuel_pct    INTEGER,
  fuel_l      REAL,
  voltage_mv  INTEGER,
  io          TEXT NOT NULL
);

-- A record sent twice (the relay retries) is kept once.
CREATE UNIQUE INDEX records_once ON records(imei, at);
CREATE INDEX records_vehicle ON records(vehicle_id, at);

-- Each vehicle's figures for one UTC day, worked out from its records. The
-- dashboard adds days up rather than reading every record.
CREATE TABLE days (
  vehicle_id    TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  day           TEXT NOT NULL,
  distance_m    INTEGER NOT NULL,
  driving_s     INTEGER NOT NULL,
  max_speed     INTEGER NOT NULL,
  trips         INTEGER NOT NULL,
  fuel_used_l   REAL,
  records       INTEGER NOT NULL,
  PRIMARY KEY (vehicle_id, day)
);

-- Days that have had new records since they were last worked out.
CREATE TABLE dirty_days (
  vehicle_id TEXT NOT NULL,
  day        TEXT NOT NULL,
  PRIMARY KEY (vehicle_id, day)
);

-- The four vehicles there are to begin with.
INSERT INTO vehicles (id, name, region, tracker, colour, position, created_at) VALUES
  ('glk', 'Mercedes GLK 350 CDI 2011', 'Europe', 'FMC003 X4', '#2563eb', 1, '2026-11-09T00:00:00.000Z'),
  ('sprinter', 'Mercedes Sprinter 2017', 'Europe', 'FMC003 X4', '#db2777', 2, '2026-11-09T00:00:00.000Z'),
  ('q5', 'Audi Q5 45 TFSI 2021', 'Panama', 'FMC003 LA', '#7c3aed', 3, '2026-11-09T00:00:00.000Z'),
  ('japan', 'Japan car', 'Japan', 'FMM003', '#0891b2', 4, '2026-11-09T00:00:00.000Z');
