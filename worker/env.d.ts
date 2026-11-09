// Everything the Worker is handed at run time. The bindings come from
// wrangler.toml; the secrets from `wrangler secret put` and, locally, from
// .dev.vars, which is never committed.

declare global {
  interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    MEDIA: R2Bucket;
    EMAIL?: SendEmailBinding;

    SITE_ORIGIN: string;
    MAIL_DOMAIN: string;

    /** Signs the sign-in codes and links. */
    SESSION_SECRET: string;
    /** The relay's key for /api/ingest. */
    INGEST_SECRET?: string;

    SIGN_IN_LIMIT?: { limit(what: { key: string }): Promise<{ success: boolean }> };
  }

  interface SendEmailAddress {
    email: string;
    name?: string;
  }

  interface SendEmailRequest {
    to: string | SendEmailAddress | (string | SendEmailAddress)[];
    from: string | SendEmailAddress;
    subject: string;
    html?: string;
    text?: string;
  }

  interface SendEmailBinding {
    send(message: SendEmailRequest): Promise<{ messageId: string }>;
  }
}

export {};
