// What Teltonika's IO numbers mean on the FMC003 and FMM003, from Teltonika's
// AVL ID list for those models. A number not here is still kept and shown by
// its number. Values are stored as the tracker sent them; `scale` and `unit`
// say how to read one.

export interface IoName {
  name: string;
  unit?: string;
  scale?: number;
}

export const IO_NAMES: Record<string, IoName> = {
  1: { name: "Digital input 1" },
  11: { name: "ICCID part 1" },
  14: { name: "ICCID part 2" },
  16: { name: "Total odometer", unit: "km", scale: 0.001 },
  17: { name: "Axis X", unit: "mG" },
  18: { name: "Axis Y", unit: "mG" },
  19: { name: "Axis Z", unit: "mG" },
  21: { name: "GSM signal" },
  24: { name: "GNSS speed", unit: "km/h" },
  30: { name: "Number of DTC" },
  31: { name: "Engine load", unit: "%" },
  32: { name: "Coolant temperature", unit: "°C" },
  33: { name: "Short fuel trim", unit: "%" },
  34: { name: "Fuel pressure", unit: "kPa" },
  35: { name: "Intake MAP", unit: "kPa" },
  36: { name: "Engine RPM", unit: "rpm" },
  37: { name: "Vehicle speed", unit: "km/h" },
  38: { name: "Timing advance", unit: "°" },
  39: { name: "Intake air temperature", unit: "°C" },
  40: { name: "MAF", unit: "g/s", scale: 0.01 },
  41: { name: "Throttle position", unit: "%" },
  42: { name: "Runtime since engine start", unit: "s" },
  43: { name: "Distance with MIL on", unit: "km" },
  44: { name: "Relative fuel rail pressure", unit: "kPa", scale: 0.1 },
  45: { name: "Direct fuel rail pressure", unit: "kPa", scale: 10 },
  46: { name: "Commanded EGR", unit: "%" },
  47: { name: "EGR error", unit: "%" },
  48: { name: "Fuel level", unit: "%" },
  49: { name: "Distance since codes cleared", unit: "km" },
  50: { name: "Barometric pressure", unit: "kPa" },
  51: { name: "Control module voltage", unit: "V", scale: 0.001 },
  52: { name: "Absolute load value", unit: "%" },
  53: { name: "Ambient air temperature", unit: "°C" },
  54: { name: "Time run with MIL on", unit: "min" },
  55: { name: "Time since codes cleared", unit: "min" },
  56: { name: "Absolute fuel rail pressure", unit: "kPa", scale: 10 },
  57: { name: "Hybrid battery pack life", unit: "%" },
  58: { name: "Engine oil temperature", unit: "°C" },
  59: { name: "Fuel injection timing", unit: "°", scale: 0.01 },
  60: { name: "Fuel rate", unit: "L/h", scale: 0.01 },
  66: { name: "External voltage", unit: "V", scale: 0.001 },
  67: { name: "Battery voltage", unit: "V", scale: 0.001 },
  68: { name: "Battery current", unit: "A", scale: 0.001 },
  69: { name: "GNSS status" },
  80: { name: "Data mode" },
  181: { name: "GNSS PDOP", scale: 0.1 },
  182: { name: "GNSS HDOP", scale: 0.1 },
  199: { name: "Trip odometer", unit: "km", scale: 0.001 },
  200: { name: "Sleep mode" },
  205: { name: "GSM cell ID" },
  206: { name: "GSM area code" },
  239: { name: "Ignition" },
  240: { name: "Movement" },
  241: { name: "Active GSM operator" },
  256: { name: "VIN" },
  281: { name: "Fault codes" },
  389: { name: "OEM total mileage", unit: "km" },
  390: { name: "OEM fuel level", unit: "L", scale: 0.1 },
};

/** The IO numbers copied into their own columns as well as kept in `io`. */
export const IO = {
  ignition: 239,
  movement: 240,
  odometer: 16,
  oemMileageKm: 389,
  fuelPct: 48,
  fuelTenthsL: 390,
  externalMv: 66,
} as const;

/** A value read for people: scaled, with its unit, and text values (the VIN,
    fault codes) turned back from hex into the letters they are. */
export function readable(id: string, value: number | string): string {
  const named = IO_NAMES[id];
  if (typeof value === "string") {
    if (/^[0-9a-f]*$/i.test(value) && value.length % 2 === 0) {
      const text = value.match(/../g)?.map((pair) => String.fromCharCode(parseInt(pair, 16))).join("") ?? "";
      if (/^[\x20-\x7e]*$/.test(text)) return text;
    }
    return value;
  }
  const scaled = named?.scale ? value * named.scale : value;
  const shown = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(Math.abs(scaled) < 10 ? 2 : 1);
  return named?.unit ? `${shown} ${named.unit}` : shown;
}

export function ioName(id: string): string {
  return IO_NAMES[id]?.name ?? `IO ${id}`;
}
