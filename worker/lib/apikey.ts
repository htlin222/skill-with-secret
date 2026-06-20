import type { MiddlewareHandler } from 'hono';
import type { AppContext, Env } from '../types';

/**
 * Per-user API-key auth for the public resource endpoints that a minted
 * `.skill` calls.
 *
 * This is the heart of the "skill-with-secret" paradigm. The path it guards is
 * *bypassed* in Cloudflare Access so external agents (Claude Code, claude.ai,
 * a CLI on a teammate's laptop) — which carry no Access session — can still
 * reach the Worker. That makes this middleware the ONLY gate.
 *
 * Each user's key is HMAC-derived, never stored:
 *   key = "stashk_" + b64url(HMAC-SHA256(STASH_KEY_SECRET, `${email}:${version}`))
 *
 * - `STASH_KEY_SECRET` is one global Worker secret. Leaking the whole D1
 *   database leaks NO usable keys, because D1 holds only the non-secret
 *   integer `key_version` salt.
 * - The caller asserts its identity via `X-User-Email`. That email selects the
 *   user row (→ version + allowlist check) and is bound into the HMAC, so a key
 *   only works for the exact email it was minted for.
 * - Revoking one user = bump `users.key_version`. Their old `.skill` starts
 *   returning 401 on the next call; nobody else is affected.
 */

const KEY_PREFIX = 'stashk_';

// The Workers runtime adds timingSafeEqual to SubtleCrypto; the standard lib
// type doesn't declare it, so widen the type here.
const subtle = crypto.subtle as SubtleCrypto & {
  timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean;
};

function b64url(bytes: ArrayBuffer): string {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Derive the stable per-user key. Pure function of (secret, email, version):
 * the same inputs always reproduce the same key, so the mint endpoint can
 * re-bake a user's `.env` at any time and this middleware can re-validate it
 * without ever persisting the key anywhere.
 */
export async function deriveKey(
  secret: string,
  email: string,
  version: number,
): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    enc.encode(`${email.trim().toLowerCase()}:${version}`),
  );
  return KEY_PREFIX + b64url(sig);
}

/** Constant-time string compare via fixed-length digests. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return subtle.timingSafeEqual(ah, bh);
}

export const apiKeyMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const secret = c.env.STASH_KEY_SECRET;
  if (!secret) {
    // Fail closed if the secret was never set.
    return c.json({ error: 'stash api not configured' }, 503);
  }

  const auth = c.req.header('Authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const email = (c.req.header('X-User-Email') ?? '').trim().toLowerCase();
  if (!presented) return c.json({ error: 'missing bearer key' }, 400);
  if (!email) return c.json({ error: 'missing X-User-Email' }, 400);

  // The email both selects the user row (allowlist + revocation) and provides
  // the per-user version that the key is bound to.
  const row = await c.env.DB.prepare(
    'SELECT key_version FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{ key_version: number }>();

  // Unknown email and bad key must be indistinguishable: this path is
  // Access-bypassed (public), so a distinct 403 would let anyone enumerate
  // membership. Versions start at 1, so deriving with 0 for an unknown email
  // can never match a minted key, and the HMAC + compare still run to keep
  // timing uniform.
  const expected = await deriveKey(secret, email, row?.key_version ?? 0);
  if (!row || !(await safeEqual(presented, expected))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  console.log(`[stash-api] ${email} (v${row.key_version}) → ${c.req.path}`);
  c.set('email', email);
  await next();
};

export type { Env };
