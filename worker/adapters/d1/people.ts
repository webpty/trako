import type { Me } from "../../../shared/types";
import type { PeopleStore, Person } from "../../ports";
import { PERSON_COLUMNS } from "./auth";
import { toPerson, type PersonRow } from "./rows";

/** The columns a settings patch may touch. Anything not in here cannot be
    written through settings, which keeps the address and the role out of reach. */
const WRITABLE: Record<string, string> = {
  name: "name",
  photoKey: "photo_key",
  country: "country",
  language: "language",
  languageChosen: "language_chosen",
  dateOrder: "date_order",
  clock24h: "clock_24h",
  timeZone: "time_zone",
};

export class D1People implements PeopleStore {
  constructor(private readonly db: D1Database) {}

  async byId(id: string): Promise<Person | null> {
    const row = await this.db.prepare(`SELECT ${PERSON_COLUMNS} FROM people p WHERE p.id = ?`).bind(id).first<PersonRow>();
    return row ? toPerson(row) : null;
  }

  async byEmail(email: string): Promise<Person | null> {
    const row = await this.db
      .prepare(`SELECT ${PERSON_COLUMNS} FROM people p WHERE p.email = ?`)
      .bind(email.trim().toLowerCase())
      .first<PersonRow>();
    return row ? toPerson(row) : null;
  }

  async all(): Promise<Person[]> {
    const { results } = await this.db
      .prepare(`SELECT ${PERSON_COLUMNS} FROM people p ORDER BY p.role = 'admin' DESC, p.name`)
      .all<PersonRow>();
    return results.map(toPerson);
  }

  async add(
    person: Parameters<PeopleStore["add"]>[0],
    now: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO people (id, email, name, role, date_order, clock_24h, time_zone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        person.id,
        person.email.trim().toLowerCase(),
        person.name.trim(),
        person.role,
        person.dateOrder,
        person.clock24h ? 1 : 0,
        person.timeZone,
        now,
      )
      .run();
  }

  async update(id: string, patch: Partial<Me>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(WRITABLE)) {
      if (!(key in patch)) continue;
      const value = (patch as Record<string, unknown>)[key];
      sets.push(`${column} = ?`);
      values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    }
    if (!sets.length) return;
    await this.db.prepare(`UPDATE people SET ${sets.join(", ")} WHERE id = ?`).bind(...values, id).run();
  }

  async remove(id: string): Promise<void> {
    await this.db.prepare(`DELETE FROM people WHERE id = ?`).bind(id).run();
  }
}
