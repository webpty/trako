// Signing in with a passkey, and adding one.
//
// Two round trips each way: the browser is given something to sign, signs it
// with the key held by the device, and we check the signature against the public
// half we kept. The value handed out is remembered for five minutes and spent on
// first use, so a captured exchange cannot be replayed.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { App } from "../app";
import type { Person } from "../ports";

const CHALLENGE_MINUTES = 5;

/** The site a passkey belongs to. Taken from where the page is actually being
    served rather than from the configured address, so a passkey made against
    the local site is never offered on the live one, or the other way round. */
export function relyingParty(pageOrigin: string): { id: string; origin: string } {
  const url = new URL(pageOrigin);
  return { id: url.hostname, origin: url.origin };
}

async function keepChallenge(
  app: App,
  purpose: "sign-in" | "add",
  value: string,
  personId: string | null,
): Promise<void> {
  const now = app.clock.now();
  await app.challenges.put(
    purpose,
    value,
    personId,
    new Date(now.getTime() + CHALLENGE_MINUTES * 60_000).toISOString(),
    now.toISOString(),
  );
}

export async function signInOptions(app: App, pageOrigin: string) {
  const { id } = relyingParty(pageOrigin);
  // No list of allowed keys: the device offers whichever of ours it holds, so
  // nothing here says whether a given address has an account.
  const options = await generateAuthenticationOptions({ rpID: id, userVerification: "preferred" });
  await keepChallenge(app, "sign-in", options.challenge, null);
  return options;
}

/** The person the signature belongs to, or null when it does not check out. */
export async function verifySignIn(
  app: App,
  pageOrigin: string,
  response: AuthenticationResponseJSON,
): Promise<Person | null> {
  const { id, origin } = relyingParty(pageOrigin);

  const passkey = await app.passkeys.byId(response.id);
  if (!passkey) return null;

  const expected = challengeIn(response.response.clientDataJSON);
  if (!expected) return null;
  if (!(await app.challenges.spend("sign-in", expected, app.clock.now().toISOString()))) {
    return null;
  }

  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: expected,
    expectedOrigin: origin,
    expectedRPID: id,
    credential: {
      id: passkey.id,
      publicKey: fromBase64Url(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports as never,
    },
  });
  if (!result.verified) return null;

  await app.passkeys.touch(
    passkey.id,
    result.authenticationInfo.newCounter,
    app.clock.now().toISOString(),
  );
  return app.people.byId(passkey.personId);
}

export async function addOptions(app: App, pageOrigin: string, person: Person) {
  const { id } = relyingParty(pageOrigin);
  const existing = await app.passkeys.forPerson(person.id);

  const options = await generateRegistrationOptions({
    rpName: "trako",
    rpID: id,
    userName: person.email,
    userDisplayName: person.name,
    attestationType: "none",
    // So a device that already holds one for this account does not make a second.
    excludeCredentials: existing.map((key) => ({ id: key.id })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });

  await keepChallenge(app, "add", options.challenge, person.id);
  return options;
}

export async function verifyAdd(
  app: App,
  pageOrigin: string,
  person: Person,
  response: RegistrationResponseJSON,
  label: string | null,
): Promise<boolean> {
  const { id, origin } = relyingParty(pageOrigin);

  const expected = challengeIn(response.response.clientDataJSON);
  if (!expected) return false;

  const kept = await app.challenges.spend("add", expected, app.clock.now().toISOString());
  if (!kept || kept.personId !== person.id) return false;

  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: expected,
    expectedOrigin: origin,
    expectedRPID: id,
  });
  if (!result.verified || !result.registrationInfo) return false;

  const { credential } = result.registrationInfo;
  await app.passkeys.add(
    {
      id: credential.id,
      personId: person.id,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: response.response.transports ?? null,
      label,
    },
    app.clock.now().toISOString(),
  );
  return true;
}

/** The value the device signed, read back out of what it returned.
 *
 * The browser hands this over as base64url with the padding left off, and atob
 * refuses it in that state. */
function challengeIn(clientDataJSON: string): string | null {
  try {
    const json = new TextDecoder().decode(fromBase64Url(clientDataJSON));
    const challenge = (JSON.parse(json) as { challenge?: unknown }).challenge;
    return typeof challenge === "string" ? challenge : null;
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
