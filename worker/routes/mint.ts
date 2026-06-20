import { Hono } from 'hono';
import { zipSync, strToU8 } from 'fflate';
import type { Context } from 'hono';
import type { AppContext } from '../types';
import { deriveKey } from '../lib/apikey';
import { SKILL_BUNDLE } from '../generated/skill-bundle';

/**
 * The minter. These routes run behind Cloudflare Access (mounted after the
 * Access middleware in index.ts), so `c.var.email` is a *verified* identity —
 * no self-asserted X-User-Email here, unlike the public resource API.
 *
 * What it does:
 *   GET  /api/me/key          → current key + version (for display in the console)
 *   POST /api/me/key/rotate   → bump the version salt; old `.skill` files 401
 *   GET  /api/me/skill        → download a `.skill` zip with a baked-in `.env`
 */
export const mintRoutes = new Hono<AppContext>();

async function currentKey(c: Context<AppContext>) {
  const secret = c.env.STASH_KEY_SECRET;
  if (!secret) return null;
  const email = c.var.email;
  const row = await c.env.DB.prepare(
    'SELECT key_version FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{ key_version: number }>();
  const version = row?.key_version ?? 1;
  const key = await deriveKey(secret, email, version);
  return { email, version, key };
}

// GET /api/me/key — current key + version, for display/copy in the console.
mintRoutes.get('/key', async (c) => {
  const k = await currentKey(c);
  if (!k) return c.json({ error: 'stash api not configured' }, 503);
  return c.json(k);
});

// POST /api/me/key/rotate — bump the version salt. Any previously downloaded
// `.skill` (carrying the old key) immediately starts returning 401.
mintRoutes.post('/key/rotate', async (c) => {
  const secret = c.env.STASH_KEY_SECRET;
  if (!secret) return c.json({ error: 'stash api not configured' }, 503);
  const email = c.var.email;
  const row = await c.env.DB.prepare(
    `UPDATE users SET key_version = key_version + 1, updated_at = ?
     WHERE email = ? RETURNING key_version`,
  )
    .bind(Date.now(), email)
    .first<{ key_version: number }>();
  const version = row?.key_version ?? 1;
  const key = await deriveKey(secret, email, version);
  return c.json({ email, version, key });
});

// GET /api/me/skill — download the personalised `.skill` bundle: the canonical
// skill files (snapshotted into worker/generated/skill-bundle.ts, since the
// Worker has no filesystem) plus a `.env` baked with this user's API base,
// derived key, and email. The archive layout mirrors `zip -r x.skill .` from
// inside the skill folder, matching the publish-the-skill format.
mintRoutes.get('/skill', async (c) => {
  const k = await currentKey(c);
  if (!k) return c.json({ error: 'stash api not configured' }, 503);

  const base = new URL(c.req.url).origin;
  const env =
    `# Auto-generated for ${k.email} — re-download from the console anytime.\n` +
    `# Personal key (v${k.version}); rotating it invalidates this file.\n` +
    `API_BASE=${base}\n` +
    `API_KEY=${k.key}\n` +
    `USER_EMAIL=${k.email}\n`;

  const files: Record<string, Uint8Array> = { '.env': strToU8(env) };
  for (const [name, content] of Object.entries(SKILL_BUNDLE)) {
    files[name] = strToU8(content);
  }

  const zip = zipSync(files, { level: 6 });
  return new Response(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="stash.skill"',
      'Cache-Control': 'no-store',
    },
  });
});
