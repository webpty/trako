import { describe, expect, it } from "vitest";
import { ack, buildImei, buildPacket, crc16, readImei, readPacket } from "./teltonika.mjs";

// The two worked examples in Teltonika's own protocol documentation, byte for
// byte, so the reader is held to the manufacturer rather than to itself.
const CODEC8 =
  "000000000000003608010000016B40D8EA30010000000000000000000000000000000105021503010101425E0F01F10000601A014E0000000000000000010000C7CF";
const CODEC8E =
  "000000000000004A8E010000016B412CEE000100000000000000000000000000000000010005000100010100010011001D00010010015E2C880002000B000000003544C87A000E000000001DD7E06A00000100002994";

describe("Teltonika packets", () => {
  it("reads Teltonika's Codec 8 example", () => {
    const read = readPacket(Buffer.from(CODEC8, "hex"));
    expect(read.codec).toBe(8);
    expect(read.used).toBe(CODEC8.length / 2);
    expect(read.records).toEqual([
      {
        at: "2019-06-10T10:04:46.000Z",
        priority: 1,
        lat: 0,
        lon: 0,
        altitude: 0,
        heading: 0,
        satellites: 0,
        speed: 0,
        eventIo: 1,
        io: { 21: 3, 1: 1, 66: 24079, 241: 24602, 78: 0 },
      },
    ]);
  });

  it("reads Teltonika's Codec 8 Extended example", () => {
    const read = readPacket(Buffer.from(CODEC8E, "hex"));
    expect(read.codec).toBe(0x8e);
    expect(read.records[0].at).toBe("2019-06-10T11:36:32.000Z");
    expect(read.records[0].io).toEqual({ 1: 1, 17: 29, 16: 22949000, 11: 893700218, 14: 500686954 });
  });

  it("waits for the rest of a packet that has only partly arrived", () => {
    expect(readPacket(Buffer.from(CODEC8.slice(0, 40), "hex"))).toBeNull();
  });

  it("refuses a packet whose check does not add up", () => {
    const broken = Buffer.from(CODEC8, "hex");
    broken[20] ^= 0xff;
    expect(readPacket(broken).bad).toBe("crc");
  });

  it("answers with the number of records taken", () => {
    expect(ack(3).toString("hex")).toBe("00000003");
  });

  it("reads the IMEI the tracker opens with", () => {
    expect(readImei(Buffer.from("000F333536333037303432343431303133", "hex"))).toEqual({
      imei: "356307042441013",
      used: 17,
    });
    expect(readImei(buildImei("356307042441013")).imei).toBe("356307042441013");
  });

  it("builds packets the reader reads back, both codecs, values of every size", () => {
    const record = {
      at: "2026-11-09T12:00:00.000Z",
      priority: 0,
      lat: 48.8566,
      lon: 2.3522,
      altitude: 35,
      heading: 270,
      satellites: 11,
      speed: 54,
      eventIo: 0,
      io: { 239: 1, 66: 13800, 16: 123456789, 11: 893700218, 256: "57444231323334" },
      sizes: { 66: 2, 16: 4, 11: 8 },
    };
    const extended = readPacket(buildPacket([record, record], true));
    expect(extended.records).toHaveLength(2);
    expect(extended.records[0].io).toEqual(record.io);
    expect(extended.records[0].lat).toBeCloseTo(48.8566, 6);

    const { 256: _vin, ...plain } = record.io;
    const short = readPacket(buildPacket([{ ...record, io: plain }]));
    expect(short.codec).toBe(8);
    expect(short.records[0].io).toEqual(plain);
  });

  it("matches the check value of the specification's example", () => {
    const data = Buffer.from(CODEC8, "hex").subarray(8, 8 + 0x36);
    expect(crc16(data)).toBe(0xc7cf);
  });
});
