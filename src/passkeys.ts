// Passkeys, and the rule about when to offer one.
//
// The button only appears on a device that has actually been given a passkey
// for this site. Offering it everywhere opens an empty sheet on a phone that
// holds nothing, which reads as a fault rather than as an empty list.

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { Me } from "../shared/types";

const HELD = "trako:passkey";

/** True when this device was given a passkey here. */
export function deviceHasOne(): boolean {
  try {
    return localStorage.getItem(HELD) === "1";
  } catch {
    return false;
  }
}

function remember(held: boolean): void {
  try {
    if (held) localStorage.setItem(HELD, "1");
    else localStorage.removeItem(HELD);
  } catch {
    // Nothing remembered: the button stays hidden, which is the safe way round.
  }
}

/** The browser can do passkeys at all. */
export function supported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

/** Null when they changed their mind, which is not a failure. */
export async function signInWithPasskey(): Promise<Me | null> {
  const options = await fetch("/api/passkeys/sign-in/options", { method: "POST" }).then((r) =>
    r.json(),
  );

  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (error) {
    if ((error as { code?: string }).code === "ERROR_CEREMONY_ABORTED") return null;
    throw error;
  }

  const result = await fetch("/api/passkeys/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(response),
  });
  const body = (await result.json().catch(() => ({}))) as { me?: Me; error?: string };
  if (!result.ok || !body.me) throw new Error(body.error ?? "That passkey was not recognised.");

  remember(true);
  return body.me;
}

/** What happened, rather than an exception for each of them. Two of the three
    are ordinary outcomes and neither deserves a red message: a device that
    already holds one, and somebody who changed their mind. */
export type AddOutcome = "added" | "already-here" | "cancelled";

export async function addPasskey(label: string): Promise<AddOutcome> {
  const options = await fetch("/api/passkeys/options", { method: "POST" }).then((r) => r.json());

  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (error) {
    const code = (error as { code?: string }).code;

    // The device is refusing a second key for the same account, which is what
    // we asked it to do. It also tells us something this browser did not know:
    // there is a passkey here after all, so stop offering one.
    if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
      remember(true);
      return "already-here";
    }
    if (code === "ERROR_CEREMONY_ABORTED") return "cancelled";
    throw error;
  }

  const result = await fetch("/api/passkeys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ response, label }),
  });
  if (!result.ok) {
    const body = (await result.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "That passkey could not be added.");
  }

  remember(true);
  return "added";
}

export interface KnownPasskey {
  id: string;
  label: string | null;
}

export async function listPasskeys(): Promise<KnownPasskey[]> {
  const result = await fetch("/api/passkeys");
  if (!result.ok) return [];
  return ((await result.json()) as { keys: KnownPasskey[] }).keys;
}

export async function removePasskey(id: string): Promise<void> {
  await fetch(`/api/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" });
  // The one this device holds may have been the one removed. It will say so the
  // next time it is tried, and the button comes back on the next add.
  remember(false);
}

/** What to call a passkey, so a list of three can be told apart. The browser
    will not say which device it is, so the platform is the best on offer. */
export function deviceName(): string {
  const agent = navigator.userAgent;
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent)) return "iPad";
  if (/Macintosh/.test(agent)) return "Mac";
  if (/Android/.test(agent)) return "Android";
  if (/Windows/.test(agent)) return "Windows";
  return "This device";
}
