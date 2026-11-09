// Signing in. Six digits by mail, a link that spends the same digits in one
// tap, or a passkey where one has been added. The people table is the
// allow-list: an address not on it is turned away, and is turned away with the
// same answer as one that is, so the page cannot be used to find out whether an
// account exists.

import type { App } from "../app";
import { codeLetter } from "../mail/paper";
import { hashCode, mintCode, sign } from "./tokens";

/** How long a code is good for, and how long a session lasts. */
const CODE_MINUTES = 10;
const SESSION_DAYS = 90;
/** Three codes per address per ten minutes, so the mailbox cannot be flooded. */
const CODES_PER_WINDOW = 3;
/** Five wrong codes and nothing is accepted for that address for a quarter of
    an hour. Six digits are only worth anything while the number of guesses is
    small: unlimited tries turn a million into an afternoon. */
const TRIES_ALLOWED = 5;
const LOCK_MINUTES = 15;
/** Wrong codes are counted, not kept: a day is long enough to be useful. */
const TRIES_KEPT_HOURS = 24;

export type RequestOutcome = "sent" | "too-many";

export async function requestCode(app: App, email: string): Promise<RequestOutcome> {
  const now = app.clock.now();
  const address = email.trim().toLowerCase();

  // The only regular moment to sweep up. Asking for a code is itself limited to
  // three in ten minutes, so this runs rarely and costs nothing.
  await app.codes
    .pruneTries(new Date(now.getTime() - TRIES_KEPT_HOURS * 3_600_000).toISOString())
    .catch(() => {});
  await app.sessions.prune(now.toISOString()).catch(() => {});

  const since = new Date(now.getTime() - CODE_MINUTES * 60_000).toISOString();
  if ((await app.codes.recentCount(address, since)) >= CODES_PER_WINDOW) return "too-many";

  // Not on the list: nothing is sent, and the page is told what it would be
  // told on success.
  const person = await app.people.byEmail(address);
  if (!person) return "sent";

  // One live code at a time. Three at once trebled the odds for anybody
  // guessing and did nothing for the person waiting on the newest one.
  await app.codes.expireAll(address, now.toISOString());

  const code = mintCode(app.random);
  await app.codes.put(
    address,
    await hashCode(app.sessionSecret, address, code),
    new Date(now.getTime() + CODE_MINUTES * 60_000).toISOString(),
    now.toISOString(),
  );

  // One press instead of six digits, which matters most on a phone. The link
  // carries the code itself, signed, so opening it spends the same single-use
  // code and nothing extra has to be stored.
  const token = await sign(app.sessionSecret, "signin", `${address}:${code}`);
  const letter = codeLetter(code, `${app.siteOrigin}/in/${token}`, CODE_MINUTES);

  await app.mailer.send({
    to: address,
    from: `codes@${app.mailDomain}`,
    fromName: "trako",
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
  });

  return "sent";
}

export interface SignedIn {
  sessionId: string;
  expiresAt: Date;
}

/** "wrong" when the code is wrong, spent or out of time, and "locked" when too
    many wrong ones have been tried for this address lately. */
export type RedeemOutcome = SignedIn | "wrong" | "locked";

export async function redeemCode(app: App, email: string, code: string): Promise<RedeemOutcome> {
  const now = app.clock.now();
  const address = email.trim().toLowerCase();
  const window = new Date(now.getTime() - LOCK_MINUTES * 60_000).toISOString();

  if ((await app.codes.triesSince(address, window)) >= TRIES_ALLOWED) return "locked";

  const hash = await hashCode(app.sessionSecret, address, code.trim());
  if (!(await app.codes.claim(address, hash, now.toISOString()))) {
    await app.codes.addTry(address, now.toISOString());

    if ((await app.codes.triesSince(address, window)) >= TRIES_ALLOWED) {
      // The codes in flight go with it. Whoever is guessing has had their five,
      // and the person it belongs to can ask for a fresh one once the quarter
      // of an hour is up.
      await app.codes.expireAll(address, now.toISOString());
    }
    return "wrong";
  }

  const person = await app.people.byEmail(address);
  if (!person) return "wrong";

  return startSession(app, person.id);
}

export async function startSession(app: App, personId: string): Promise<SignedIn> {
  const now = app.clock.now();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  const sessionId = await app.sessions.create(
    personId,
    expiresAt.toISOString(),
    now.toISOString(),
  );
  return { sessionId, expiresAt };
}
