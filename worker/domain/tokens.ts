// The link in a sign-in message carries no session, because the person opening
// it is not signed in yet. It carries a value signed with SESSION_SECRET
// instead, which proves we minted it and says what it is for. Rotating the
// secret voids every link already sent.

const encoder = new TextEncoder();

export type TokenPurpose = "signin";

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...view))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Signs `purpose:subject` and returns the whole thing as one URL-safe string. */
export async function sign(
  secret: string,
  purpose: TokenPurpose,
  subject: string,
): Promise<string> {
  const body = `${purpose}:${subject}`;
  const mac = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(body));
  return `${toBase64Url(encoder.encode(body))}.${toBase64Url(mac)}`;
}

/** Returns the subject when the token is ours and is for this purpose, else
    null. Anything at all may arrive here, since these travel in links that get
    pasted, forwarded and mangled, so nothing it is handed may make it throw. */
export async function verify(
  secret: string,
  purpose: TokenPurpose,
  token: string,
): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  let bodyBytes: Uint8Array;
  let mac: Uint8Array;
  try {
    bodyBytes = fromBase64Url(token.slice(0, dot));
    mac = fromBase64Url(token.slice(dot + 1));
  } catch {
    // Not base64 at all, which is answer enough.
    return null;
  }

  const ok = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    mac as BufferSource,
    bodyBytes as BufferSource,
  );
  if (!ok) return null;

  const body = new TextDecoder().decode(bodyBytes);
  const colon = body.indexOf(":");
  if (colon < 1) return null;
  if (body.slice(0, colon) !== purpose) return null;
  return body.slice(colon + 1);
}

/** The six digits sent by mail, and the hash kept instead of the digits. */
export function mintCode(random: { bytes(n: number): Uint8Array }): string {
  const bytes = random.bytes(4);
  const n = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, "0");
}

export async function hashCode(secret: string, email: string, code: string): Promise<string> {
  const mac = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    encoder.encode(`${email.toLowerCase()}:${code}`),
  );
  return toBase64Url(mac);
}

/** A short, readable identifier. Long enough that two made in the same
    millisecond cannot collide, short enough to read out. */
export function id(random: { bytes(n: number): Uint8Array }): string {
  const alphabet = "0123456789abcdefghijkmnpqrstuvwxyz";
  return Array.from(random.bytes(16), (b) => alphabet[b % alphabet.length]).join("");
}
