// A pretend Teltonika tracker, for checking the relay end to end.
//
//   node scripts/pretend-tracker.mjs [host] [port] [imei]
//
// Connects, sends its IMEI, waits for the 0x01, then drives a short loop and
// sends it as real Codec 8 Extended packets, ten records at a time, checking
// each answer is the number of records sent. Then one plain Codec 8 packet.
// The records are dated in the hour before now, so they land in "30 days".

import { connect } from "node:net";
import { buildImei, buildPacket } from "../relay/teltonika.mjs";

const host = process.argv[2] ?? "127.0.0.1";
const port = Number(process.argv[3] ?? 5027);
const imei = process.argv[4] ?? "350000000000001";

// A drive round the Casco Viejo in Panama City and back, as corners.
const CORNERS = [
  [-79.5199, 8.9824],
  [-79.5336, 8.9706],
  [-79.5352, 8.9529],
  [-79.5318, 8.9516],
  [-79.5235, 8.9617],
  [-79.5199, 8.9824],
];

function route() {
  const points = [];
  const steps = 12;
  for (let leg = 0; leg < CORNERS.length - 1; leg++) {
    const [a, b] = [CORNERS[leg], CORNERS[leg + 1]];
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, b]);
    }
  }
  const start = Date.now() - 60 * 60_000;
  let odometer = 45_210_000;
  let fuel = 640;
  return points.map(([lon, lat, towards], i) => {
    const heading = Math.round(((Math.atan2(towards[0] - lon, towards[1] - lat) * 180) / Math.PI + 360) % 360);
    const last = i === points.length - 1;
    const speed = i === 0 || last ? 0 : 25 + ((i * 7) % 30);
    odometer += speed * 10 / 3.6;
    fuel -= 1;
    return {
      at: new Date(start + i * 30_000).toISOString(),
      priority: 0,
      lat,
      lon,
      altitude: 12,
      heading,
      satellites: 12,
      speed,
      eventIo: last ? 239 : 0,
      io: {
        239: last ? 0 : 1, // ignition
        240: speed > 0 ? 1 : 0, // movement
        21: 4, // GSM signal
        69: 1, // GNSS status
        66: 14100, // external voltage, mV
        36: 900 + speed * 40, // engine RPM
        37: speed, // OBD vehicle speed
        48: 62, // fuel level, %
        390: fuel, // OEM fuel level, 0.1 L
        16: Math.round(odometer), // total odometer, m
        256: Buffer.from("WDC2049921F123456").toString("hex"), // VIN
      },
      sizes: { 66: 2, 36: 2, 16: 4, 390: 4 },
    };
  });
}

function send(socket, bytes) {
  return new Promise((done, fail) => {
    const answer = (chunk) => {
      socket.off("error", fail);
      done(chunk);
    };
    socket.once("data", answer);
    socket.once("error", fail);
    socket.write(bytes);
  });
}

const socket = connect(port, host);
await new Promise((done, fail) => {
  socket.once("connect", done);
  socket.once("error", fail);
});

const accepted = await send(socket, buildImei(imei));
if (accepted[0] !== 1) throw new Error(`IMEI refused: ${accepted.toString("hex")}`);
console.log(`${imei} accepted by ${host}:${port}`);

const records = route();
let sent = 0;
for (let i = 0; i < records.length; i += 10) {
  const chunk = records.slice(i, i + 10);
  const answer = await send(socket, buildPacket(chunk, true));
  const taken = answer.readUInt32BE(0);
  if (taken !== chunk.length) throw new Error(`sent ${chunk.length}, the relay took ${taken}`);
  sent += taken;
}

// One plain Codec 8 packet, without the values only the extended codec carries.
const plain = {
  ...records[records.length - 1],
  at: new Date().toISOString(),
  io: { 239: 0, 240: 0, 66: 13900 },
  sizes: { 66: 2 },
};
const answer = await send(socket, buildPacket([plain], false));
if (answer.readUInt32BE(0) !== 1) throw new Error("the Codec 8 packet was not taken");
sent += 1;

console.log(`${sent} records sent and acknowledged`);
socket.end();
