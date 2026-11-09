// Where the real things are put behind the interfaces. Everything above this
// takes its dependencies as arguments, which is what lets the rules be read
// and tested without a database, a mail server or a clock.

import { D1Challenges, D1Codes, D1Passkeys, D1Sessions } from "./adapters/d1/auth";
import { D1Days } from "./adapters/d1/days";
import { D1Trackers, D1Vehicles } from "./adapters/d1/fleet";
import { D1People } from "./adapters/d1/people";
import { D1Records } from "./adapters/d1/records";
import { CloudflareMailer, LoggingMailer } from "./adapters/mail/cloudflare";
import { R2Media } from "./adapters/r2/media";
import type {
  ChallengeStore,
  Clock,
  CodeStore,
  DayStore,
  Mailer,
  MediaStore,
  PasskeyStore,
  PeopleStore,
  Random,
  RecordStore,
  SessionStore,
  TrackerStore,
  VehicleStore,
} from "./ports";

export interface App {
  people: PeopleStore;
  codes: CodeStore;
  sessions: SessionStore;
  challenges: ChallengeStore;
  passkeys: PasskeyStore;
  vehicles: VehicleStore;
  trackers: TrackerStore;
  records: RecordStore;
  days: DayStore;
  media: MediaStore;
  mailer: Mailer;
  clock: Clock;
  random: Random;
  siteOrigin: string;
  mailDomain: string;
  sessionSecret: string;
  ingestSecret: string | null;
  /** The site's icon, for the top of a message. Null where it cannot be had. */
  icon(): Promise<ArrayBuffer | null>;
}

const clock: Clock = { now: () => new Date() };
const random: Random = { bytes: (n) => crypto.getRandomValues(new Uint8Array(n)) };

export function build(env: Env): App {
  return {
    people: new D1People(env.DB),
    codes: new D1Codes(env.DB),
    sessions: new D1Sessions(env.DB),
    challenges: new D1Challenges(env.DB),
    passkeys: new D1Passkeys(env.DB),
    vehicles: new D1Vehicles(env.DB),
    trackers: new D1Trackers(env.DB),
    records: new D1Records(env.DB),
    days: new D1Days(env.DB),
    media: new R2Media(env.MEDIA),
    // Development has no sender bound, so the code goes to the log instead of
    // the sign-in silently failing.
    mailer: env.EMAIL ? new CloudflareMailer(env.EMAIL) : new LoggingMailer(),
    clock,
    random,
    siteOrigin: env.SITE_ORIGIN,
    mailDomain: env.MAIL_DOMAIN,
    sessionSecret: env.SESSION_SECRET,
    ingestSecret: env.INGEST_SECRET || null,
    icon: async () => {
      const response = await env.ASSETS.fetch(new Request(`${env.SITE_ORIGIN}/icon-192.png`)).catch(() => null);
      return response?.ok ? response.arrayBuffer() : null;
    },
  };
}
