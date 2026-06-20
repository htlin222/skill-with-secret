import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Context, Next } from 'hono';
import type { AppContext } from '../types';

/**
 * Cloudflare Access JWT verification — used to gate the *minting* routes only
 * (downloading your own `.skill`, viewing/rotating your key). The public
 * resource API is gated by the bearer key instead (see lib/apikey.ts).
 *
 * Every request to a Worker behind Access carries
 *   Cf-Access-Jwt-Assertion: <jwt>
 * We verify it against CF's public JWKS, then trust the `email` claim. No
 * passwords, sessions, or app-level auth code — that's the whole point.
 *
 * Local dev (`wrangler dev`) has no Access in front, so when
 * CF_ACCESS_TEAM_DOMAIN === 'localhost' we fall back to an `X-Dev-Email`
 * header. Never enable that bypass in production.
 */

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(teamDomain: string) {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

function jwtFromRequest(c: Context<AppContext>): string | null {
  const header = c.req.header('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = c.req.header('Cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === 'CF_Authorization') {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

async function upsertUser(db: D1Database, email: string) {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO users (email, key_version, created_at, updated_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(email, now, now)
    .run();
}

export async function accessMiddleware(c: Context<AppContext>, next: Next) {
  const token = jwtFromRequest(c);

  // Local dev fallback — Access isn't in front of `wrangler dev`.
  if (!token) {
    const devEmail = c.req.header('X-Dev-Email');
    if (devEmail && c.env.CF_ACCESS_TEAM_DOMAIN === 'localhost') {
      const email = devEmail.trim().toLowerCase();
      c.set('email', email);
      await upsertUser(c.env.DB, email);
      return next();
    }
    return c.json({ error: 'unauthenticated' }, 401);
  }

  try {
    const jwks = getJWKS(c.env.CF_ACCESS_TEAM_DOMAIN);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${c.env.CF_ACCESS_TEAM_DOMAIN}`,
      audience: c.env.CF_ACCESS_AUD,
    });

    const email = ((payload.email as string) || '').trim().toLowerCase();
    if (!email) return c.json({ error: 'no email claim' }, 401);

    c.set('email', email);
    await upsertUser(c.env.DB, email);
    return next();
  } catch (err) {
    // Verification failure detail (issuer/audience/expiry) goes to the log
    // only — it describes our Access config to whoever sent the token.
    console.warn('access jwt rejected:', String(err));
    return c.json({ error: 'invalid token' }, 401);
  }
}
