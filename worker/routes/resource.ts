import { Hono } from 'hono';
import type { AppContext } from '../types';
import { apiKeyMiddleware } from '../lib/apikey';

/**
 * The example *protected resource*: a tiny per-user key/value "stash" on KV.
 * This is what a minted `.skill` talks to. Swap this module for your own infra
 * — the minting + auth machinery around it is the reusable part.
 *
 * Every route is gated by the per-user bearer key (apiKeyMiddleware), and this
 * router is mounted BEFORE the Access middleware in index.ts, so it never
 * inherits Access gating — external agents reach it with their key alone.
 */
export const resourceRoutes = new Hono<AppContext>();

resourceRoutes.use('*', apiKeyMiddleware);

// KV keys are namespaced by the authenticated email so users never collide.
const k = (email: string, key: string) => `${email}::${key}`;

// GET /api/kv — list this user's keys.
resourceRoutes.get('/', async (c) => {
  const email = c.var.email;
  const prefix = `${email}::`;
  const { keys } = await c.env.STASH_KV.list({ prefix });
  return c.json({ keys: keys.map((x) => x.name.slice(prefix.length)) });
});

// GET /api/kv/:key — read one value.
resourceRoutes.get('/:key', async (c) => {
  const email = c.var.email;
  const key = c.req.param('key');
  const value = await c.env.STASH_KV.get(k(email, key));
  if (value === null) return c.json({ error: 'not found', key }, 404);
  return c.json({ key, value });
});

// PUT /api/kv/:key — write one value (raw request body is the value).
resourceRoutes.put('/:key', async (c) => {
  const email = c.var.email;
  const key = c.req.param('key');
  const value = await c.req.text();
  await c.env.STASH_KV.put(k(email, key), value);
  return c.json({ ok: true, key });
});

// DELETE /api/kv/:key — remove one value.
resourceRoutes.delete('/:key', async (c) => {
  const email = c.var.email;
  const key = c.req.param('key');
  await c.env.STASH_KV.delete(k(email, key));
  return c.json({ ok: true, key });
});
