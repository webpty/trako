import type {
  ChallengeStore,
  CodeStore,
  Passkey,
  PasskeyStore,
  Person,
  SessionStore,
} from "../../ports";
import { toPasskey, toPerson, type PasskeyRow, type PersonRow } from "./rows";

export const PERSON_COLUMNS = `p.id, p.email, p.name, p.role, p.photo_key, p.country,
  p.language, p.language_chosen, p.date_order, p.clock_24h, p.time_zone, p.created_at`;

export class D1Codes implements CodeStore {
  constructor(private readonly db: D1Database) {}

  async recentCount(email: string, since: string): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM codes WHERE email = ? AND created_at > ?`)
      .bind(email.toLowerCase(), since)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async put(email: string, codeHash: string, expiresAt: string, now: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), email.toLowerCase(), codeHash, expiresAt, now)
      .run();
  }

  // Marking it used in the same statement that finds it means a code cannot be
  // spent twice, however fast the second attempt arrives.
  async claim(email: string, codeHash: string, now: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE codes SET used_at = ?
         WHERE id = (
           SELECT id FROM codes
           WHERE email = ? AND code_hash = ? AND used_at IS NULL AND expires_at > ?
           ORDER BY created_at DESC LIMIT 1
         )`,
      )
      .bind(now, email.toLowerCase(), codeHash, now)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async expireAll(email: string, now: string): Promise<void> {
    await this.db
      .prepare(`UPDATE codes SET used_at = ? WHERE email = ? AND used_at IS NULL`)
      .bind(now, email.toLowerCase())
      .run();
  }

  async addTry(email: string, now: string): Promise<void> {
    await this.db
      .prepare(`INSERT INTO sign_in_tries (email, at) VALUES (?, ?)`)
      .bind(email.toLowerCase(), now)
      .run();
  }

  async triesSince(email: string, since: string): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM sign_in_tries WHERE email = ? AND at > ?`)
      .bind(email.toLowerCase(), since)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async pruneTries(before: string): Promise<void> {
    await this.db.prepare(`DELETE FROM sign_in_tries WHERE at < ?`).bind(before).run();
  }
}

export class D1Sessions implements SessionStore {
  constructor(private readonly db: D1Database) {}

  async create(personId: string, expiresAt: string, now: string): Promise<string> {
    const id = crypto.randomUUID();
    await this.db
      .prepare(`INSERT INTO sessions (id, person_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
      .bind(id, personId, expiresAt, now)
      .run();
    return id;
  }

  async personFor(sessionId: string, now: string): Promise<Person | null> {
    const row = await this.db
      .prepare(
        `SELECT ${PERSON_COLUMNS} FROM sessions s
         JOIN people p ON p.id = s.person_id
         WHERE s.id = ? AND s.expires_at > ?`,
      )
      .bind(sessionId, now)
      .first<PersonRow>();
    return row ? toPerson(row) : null;
  }

  async destroy(sessionId: string): Promise<void> {
    await this.db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
  }

  async prune(now: string): Promise<void> {
    await this.db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(now).run();
  }
}

export class D1Passkeys implements PasskeyStore {
  constructor(private readonly db: D1Database) {}

  async forPerson(personId: string): Promise<Passkey[]> {
    const { results } = await this.db
      .prepare(
        `SELECT id, person_id, public_key, counter, transports, label
         FROM passkeys WHERE person_id = ? ORDER BY created_at`,
      )
      .bind(personId)
      .all<PasskeyRow>();
    return results.map(toPasskey);
  }

  async byId(id: string): Promise<Passkey | null> {
    const row = await this.db
      .prepare(
        `SELECT id, person_id, public_key, counter, transports, label FROM passkeys WHERE id = ?`,
      )
      .bind(id)
      .first<PasskeyRow>();
    return row ? toPasskey(row) : null;
  }

  async add(key: Passkey, now: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO passkeys (id, person_id, public_key, counter, transports, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        key.id,
        key.personId,
        key.publicKey,
        key.counter,
        key.transports ? JSON.stringify(key.transports) : null,
        key.label,
        now,
      )
      .run();
  }

  async touch(id: string, counter: number, now: string): Promise<void> {
    await this.db
      .prepare(`UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?`)
      .bind(counter, now, id)
      .run();
  }

  async remove(id: string, personId: string): Promise<void> {
    await this.db
      .prepare(`DELETE FROM passkeys WHERE id = ? AND person_id = ?`)
      .bind(id, personId)
      .run();
  }
}

export class D1Challenges implements ChallengeStore {
  constructor(private readonly db: D1Database) {}

  async put(
    purpose: string,
    value: string,
    personId: string | null,
    expiresAt: string,
    now: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO challenges (id, purpose, person_id, value, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), purpose, personId, value, expiresAt, now)
      .run();
  }

  async spend(
    purpose: string,
    value: string,
    now: string,
  ): Promise<{ personId: string | null } | undefined> {
    const row = await this.db
      .prepare(
        `SELECT id, person_id FROM challenges
         WHERE value = ? AND purpose = ? AND expires_at > ?`,
      )
      .bind(value, purpose, now)
      .first<{ id: string; person_id: string | null }>();
    if (!row) return undefined;

    await this.db.prepare(`DELETE FROM challenges WHERE id = ?`).bind(row.id).run();
    return { personId: row.person_id };
  }
}
