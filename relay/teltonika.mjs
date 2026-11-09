// Teltonika's data protocol over TCP, Codec 8 and Codec 8 Extended.
//
// A tracker opens a connection and sends its IMEI first: two bytes of length,
// then the IMEI in ASCII. It waits for one byte, 0x01, before sending anything
// else. After that it sends AVL packets:
//
//   4 bytes   zero
//   4 bytes   length of the data field (codec id up to the second count)
//   1 byte    codec id, 0x08 or 0x8E
//   1 byte    number of records
//   ...       the records
//   1 byte    number of records again
//   4 bytes   CRC-16/IBM of the data field, in the low two bytes
//
// and waits for the number of records accepted, as four bytes big-endian,
// before it deletes them from its own memory. Anything else, or nothing, and
// it sends them again. So the answer is only given once the records are safe.
//
// Plain JavaScript with no packages, so the relay server runs it as it stands.

/** CRC-16/IBM (also called ARC): reflected polynomial 0xA001, start 0. */
export function crc16(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}

/**
 * The IMEI at the start of a buffer, if all of it has arrived.
 * @param {Buffer} buffer
 * @returns {{ imei: string, used: number } | null | "bad"}
 */
export function readImei(buffer) {
  if (buffer.length < 2) return null;
  const length = buffer.readUInt16BE(0);
  if (length < 8 || length > 20) return "bad";
  if (buffer.length < 2 + length) return null;
  const imei = buffer.subarray(2, 2 + length).toString("ascii");
  if (!/^\d+$/.test(imei)) return "bad";
  return { imei, used: 2 + length };
}

/**
 * One AVL packet from the start of a buffer, if all of it has arrived.
 * @param {Buffer} buffer
 * @returns {{ codec: number, records: object[], used: number } | null | { bad: string, used: number }}
 */
export function readPacket(buffer) {
  if (buffer.length < 8) return null;
  if (buffer.readUInt32BE(0) !== 0) return { bad: "no preamble", used: buffer.length };
  const length = buffer.readUInt32BE(4);
  if (length < 3 || length > 1_000_000) return { bad: "length", used: buffer.length };
  const total = 8 + length + 4;
  if (buffer.length < total) return null;

  const data = buffer.subarray(8, 8 + length);
  const crc = buffer.readUInt32BE(8 + length);
  if ((crc & 0xffff) !== crc16(data) || crc >>> 16 !== 0) return { bad: "crc", used: total };

  const codec = data[0];
  if (codec !== 0x08 && codec !== 0x8e) return { bad: `codec ${codec}`, used: total };
  const count = data[1];
  if (data[length - 1] !== count) return { bad: "count", used: total };

  const records = [];
  let at = 2;
  try {
    for (let i = 0; i < count; i++) {
      const read = readRecord(data, at, codec === 0x8e);
      records.push(read.record);
      at = read.at;
    }
  } catch {
    return { bad: "record", used: total };
  }
  if (at !== length - 1) return { bad: "leftover", used: total };
  return { codec, records, used: total };
}

/** The answer to a packet: how many records were taken. */
export function ack(count) {
  const answer = Buffer.alloc(4);
  answer.writeUInt32BE(count);
  return answer;
}

function readRecord(data, start, extended) {
  let at = start;
  const time = Number(data.readBigUInt64BE(at));
  at += 8;
  const priority = data[at];
  at += 1;
  const lon = data.readInt32BE(at) / 1e7;
  const lat = data.readInt32BE(at + 4) / 1e7;
  const altitude = data.readInt16BE(at + 8);
  const heading = data.readUInt16BE(at + 10);
  const satellites = data[at + 12];
  const speed = data.readUInt16BE(at + 13);
  at += 15;

  // The IO part. Codec 8 counts and numbers in one byte, Codec 8 Extended in
  // two, and only the extended one has values of any length at the end.
  const small = extended ? 2 : 1;
  const readSmall = (offset) => (extended ? data.readUInt16BE(offset) : data[offset]);

  const eventIo = readSmall(at);
  at += small;
  at += small; // the total, which is the sum of the counts below
  /** @type {Record<string, number | string>} */
  const io = {};

  for (const size of [1, 2, 4, 8]) {
    const n = readSmall(at);
    at += small;
    for (let i = 0; i < n; i++) {
      const id = readSmall(at);
      at += small;
      io[id] = readValue(data, at, size);
      at += size;
    }
  }

  if (extended) {
    const n = data.readUInt16BE(at);
    at += 2;
    for (let i = 0; i < n; i++) {
      const id = data.readUInt16BE(at);
      const length = data.readUInt16BE(at + 2);
      at += 4;
      io[id] = data.subarray(at, at + length).toString("hex");
      at += length;
    }
  }

  if (at > data.length - 1) throw new Error("short record");

  return {
    at,
    record: {
      at: new Date(time).toISOString(),
      priority,
      lat,
      lon,
      altitude,
      heading,
      satellites,
      speed,
      eventIo,
      io,
    },
  };
}

/** Unsigned, as Teltonika sends them; an eight-byte one kept as a number when
    it fits, as a string of digits when it does not. */
function readValue(data, at, size) {
  if (size === 1) return data[at];
  if (size === 2) return data.readUInt16BE(at);
  if (size === 4) return data.readUInt32BE(at);
  const big = data.readBigUInt64BE(at);
  return big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big.toString();
}

/**
 * A packet built from records, the way a tracker builds one. Used by the
 * pretend tracker and the tests, so the reader is checked against something
 * made byte for byte to the specification rather than against itself.
 */
export function buildPacket(records, extended = false) {
  const parts = [];
  const small = (value) => {
    const b = Buffer.alloc(extended ? 2 : 1);
    if (extended) b.writeUInt16BE(value);
    else b.writeUInt8(value);
    return b;
  };

  for (const record of records) {
    const head = Buffer.alloc(8 + 1 + 15);
    head.writeBigUInt64BE(BigInt(new Date(record.at).getTime()), 0);
    head.writeUInt8(record.priority ?? 0, 8);
    head.writeInt32BE(Math.round(record.lon * 1e7), 9);
    head.writeInt32BE(Math.round(record.lat * 1e7), 13);
    head.writeInt16BE(record.altitude ?? 0, 17);
    head.writeUInt16BE(record.heading ?? 0, 19);
    head.writeUInt8(record.satellites ?? 0, 21);
    head.writeUInt16BE(record.speed ?? 0, 22);
    parts.push(head);

    const bySize = { 1: [], 2: [], 4: [], 8: [], x: [] };
    for (const [id, value] of Object.entries(record.io ?? {})) {
      const size = typeof value === "string" ? "x" : (record.sizes?.[id] ?? 1);
      bySize[size].push([Number(id), value]);
    }
    const total = Object.values(bySize).reduce((sum, list) => sum + list.length, 0);
    parts.push(small(record.eventIo ?? 0), small(extended ? total : total - bySize.x.length));
    for (const size of [1, 2, 4, 8]) {
      parts.push(small(bySize[size].length));
      for (const [id, value] of bySize[size]) {
        const b = Buffer.alloc(size);
        if (size === 1) b.writeUInt8(value);
        if (size === 2) b.writeUInt16BE(value);
        if (size === 4) b.writeUInt32BE(value);
        if (size === 8) b.writeBigUInt64BE(BigInt(value));
        parts.push(small(id), b);
      }
    }
    if (extended) {
      const nx = Buffer.alloc(2);
      nx.writeUInt16BE(bySize.x.length);
      parts.push(nx);
      for (const [id, hex] of bySize.x) {
        const value = Buffer.from(hex, "hex");
        const h = Buffer.alloc(4);
        h.writeUInt16BE(id, 0);
        h.writeUInt16BE(value.length, 2);
        parts.push(h, value);
      }
    }
  }

  const data = Buffer.concat([
    Buffer.from([extended ? 0x8e : 0x08, records.length]),
    ...parts,
    Buffer.from([records.length]),
  ]);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 4);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc16(data));
  return Buffer.concat([head, data, tail]);
}

/** The IMEI the way a tracker opens with it. */
export function buildImei(imei) {
  const head = Buffer.alloc(2);
  head.writeUInt16BE(imei.length);
  return Buffer.concat([head, Buffer.from(imei, "ascii")]);
}
