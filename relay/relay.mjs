// The relay: takes the trackers' TCP connections, answers them the way
// Teltonika expects, and passes every record on to trako.cc over HTTPS.
//
// Cloudflare cannot take raw TCP below its Enterprise plan, so this runs on a
// small server of its own. Nothing is lost when trako.cc cannot be reached:
// a packet is written to disk before the tracker is told it arrived, and the
// files are sent on, oldest first, until the site has taken them.
//
//   PORT           where trackers connect, 5027 unless set
//   INGEST_URL     https://trako.cc/api/ingest
//   INGEST_SECRET  the same value as the Worker's INGEST_SECRET
//   SPOOL_DIR      where packets wait, /var/lib/trako-relay/spool unless set
//
// Plain Node, no packages.

import { closeSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { ack, readImei, readPacket } from "./teltonika.mjs";

const PORT = Number(process.env.PORT ?? 5027);
const INGEST_URL = process.env.INGEST_URL ?? "";
const INGEST_SECRET = process.env.INGEST_SECRET ?? "";
const SPOOL_DIR = process.env.SPOOL_DIR ?? "/var/lib/trako-relay/spool";

/** A tracker that says nothing for this long is let go; it reconnects. */
const IDLE_MS = 15 * 60_000;
/** How many waiting files go in one request to the site. */
const BATCH_FILES = 50;
const FIRST_WAIT_MS = 2_000;
const LONGEST_WAIT_MS = 5 * 60_000;

if (!INGEST_URL || !INGEST_SECRET) {
  console.error("INGEST_URL and INGEST_SECRET must both be set.");
  process.exit(1);
}

mkdirSync(SPOOL_DIR, { recursive: true });

let sequence = 0;

/** Written whole and flushed to the disk before the tracker hears back, then
    renamed into place, so a file in the spool is always complete. */
function spool(imei, records, remote) {
  const name = `${Date.now()}-${process.pid}-${String(sequence++).padStart(6, "0")}`;
  const temporary = join(SPOOL_DIR, `${name}.tmp`);
  const body = JSON.stringify({ imei, receivedAt: new Date().toISOString(), remote, records });
  const fd = openSync(temporary, "w");
  try {
    writeSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, join(SPOOL_DIR, `${name}.json`));
}

const server = createServer((socket) => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;
  let imei = null;
  let buffer = Buffer.alloc(0);
  socket.setTimeout(IDLE_MS);
  socket.setKeepAlive(true, 60_000);

  socket.on("timeout", () => socket.destroy());
  socket.on("error", (error) => console.log(`${imei ?? remote} ${error.code ?? error.message}`));
  socket.on("close", () => console.log(`${imei ?? remote} closed`));

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    if (!imei) {
      const read = readImei(buffer);
      if (read === null) return;
      if (read === "bad") {
        console.log(`${remote} sent no IMEI`);
        socket.destroy();
        return;
      }
      imei = read.imei;
      buffer = buffer.subarray(read.used);
      // Every IMEI is taken: an unknown tracker is registered by the site as
      // unassigned, so it shows up on its first connection.
      socket.write(Buffer.from([0x01]));
      console.log(`${imei} connected from ${remote}`);
    }

    for (;;) {
      const read = readPacket(buffer);
      if (read === null) return;
      buffer = buffer.subarray(read.used);
      if ("bad" in read) {
        // Nothing taken, so the tracker sends the same records again.
        console.log(`${imei} bad packet: ${read.bad}`);
        socket.write(ack(0));
        continue;
      }
      try {
        spool(imei, read.records, remote);
      } catch (error) {
        console.error(`${imei} could not keep a packet: ${error.message}`);
        socket.write(ack(0));
        continue;
      }
      socket.write(ack(read.records.length));
      console.log(`${imei} ${read.records.length} records, codec ${read.codec.toString(16)}`);
    }
  });
});

server.listen(PORT, () => console.log(`listening on ${PORT}`));

// Sending on. One request at a time, oldest first, waiting longer after each
// failure and starting again at once after a success.
let wait = FIRST_WAIT_MS;

async function sendWaiting() {
  const files = readdirSync(SPOOL_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .slice(0, BATCH_FILES);
  if (!files.length) return "idle";

  const batches = [];
  for (const name of files) {
    try {
      batches.push(JSON.parse(readFileSync(join(SPOOL_DIR, name), "utf8")));
    } catch {
      // A file that cannot be read can never be sent; it is set aside rather
      // than holding up everything behind it.
      renameSync(join(SPOOL_DIR, name), join(SPOOL_DIR, `${name}.unreadable`));
      return "sent";
    }
  }

  const response = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${INGEST_SECRET}` },
    body: JSON.stringify({ batches }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`the site said ${response.status}`);

  for (const name of files) rmSync(join(SPOOL_DIR, name), { force: true });
  console.log(`sent ${batches.reduce((n, b) => n + b.records.length, 0)} records`);
  return "sent";
}

async function loop() {
  for (;;) {
    try {
      const outcome = await sendWaiting();
      wait = FIRST_WAIT_MS;
      if (outcome === "sent") continue;
    } catch (error) {
      console.error(`not sent, trying again in ${Math.round(wait / 1000)} s: ${error.message}`);
      wait = Math.min(wait * 2, LONGEST_WAIT_MS);
    }
    await new Promise((done) => setTimeout(done, wait));
  }
}

void loop();
