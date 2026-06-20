import type { Context, Next } from 'hono';
import type { AppContext } from '../types';
import { upsertUser } from './access';

/**
 * Demo-mode identity. Used ONLY when DEMO_MODE === '1' (set in
 * wrangler.demo.toml), in place of Cloudflare Access on the minting routes.
 *
 * There is no login: each browser gets a stable-but-ephemeral identity via a
 * cookie holding a random `demo+<rand>@example.com`. That lets an anonymous
 * visitor download a real `.skill`, rotate it, and watch the old one 401 —
 * the full paradigm — without being on anyone's allowlist.
 *
 * This deliberately bypasses the auth that is the whole point of the project,
 * so it must never run on the real instance. The public /api/kv path is
 * unchanged: a demo email is just an email, keyed by its derived key.
 */

const COOKIE = 'demo_id';

function randEmail(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `demo+${hex}@example.com`;
}

function readCookie(c: Context<AppContext>, name: string): string | null {
  const cookie = c.req.header('Cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export async function demoMiddleware(c: Context<AppContext>, next: Next) {
  let email = readCookie(c, COOKIE);
  if (!email || !email.startsWith('demo+')) {
    email = randEmail();
    // httpOnly: the console reads the email back from /api/me/key, not the
    // cookie. Max-Age caps demo-email sprawl by reusing one per browser/day.
    c.header(
      'Set-Cookie',
      `${COOKIE}=${encodeURIComponent(email)}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
    );
  }
  c.set('email', email);
  await upsertUser(c.env.DB, email);
  await next();
}
