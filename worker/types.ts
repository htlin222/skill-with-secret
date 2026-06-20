/// <reference types="@cloudflare/workers-types" />

export interface Env {
  /** D1: holds the user allowlist + the non-secret per-user key_version salt. */
  DB: D1Database;
  /** KV: the example protected resource (a per-user key/value "stash"). */
  STASH_KV: KVNamespace;
  /** The one global HMAC secret all per-user keys are derived from. */
  STASH_KEY_SECRET: string;
  /** Cloudflare Access team domain, or "localhost" to enable the dev bypass. */
  CF_ACCESS_TEAM_DOMAIN: string;
  /** Cloudflare Access application AUD (audience) tag. */
  CF_ACCESS_AUD: string;
  /** "1" → public demo mode: bypass Access with an ephemeral cookie identity. */
  DEMO_MODE?: string;
}

export type AppContext = {
  Bindings: Env;
  Variables: {
    /** Set by the Access middleware (minting) or the bearer middleware (API). */
    email: string;
  };
};
