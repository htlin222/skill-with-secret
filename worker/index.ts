import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Context, Next } from 'hono';
import { accessMiddleware } from './lib/access';
import { demoMiddleware } from './lib/demo';
import { resourceRoutes } from './routes/resource';
import { mintRoutes } from './routes/mint';
import { CONSOLE_HTML } from './console';
import type { AppContext } from './types';

const app = new Hono<AppContext>();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      if (!origin) return origin;
      if (origin === new URL(c.req.url).origin) return origin;
      try {
        const { hostname } = new URL(origin);
        if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
      } catch {
        /* malformed Origin is not allowed */
      }
      return null;
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-User-Email', 'X-Dev-Email'],
  }),
);

// Health check (no auth).
app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }));

// ---- Public resource API ---------------------------------------------------
// Gated by the per-user bearer key (lib/apikey.ts), NOT Access. Registered
// BEFORE the Access middleware so external agents reach it with their key
// alone. This path must be in your CF Access *Bypass* policy.
app.route('/api/kv', resourceRoutes);

// ---- Everything below requires identity ------------------------------------
// Real instance: Cloudflare Access. Demo instance (DEMO_MODE=1): ephemeral
// cookie identity, no login. Chosen per-request so env is available.
const gate = (c: Context<AppContext>, next: Next) =>
  c.env.DEMO_MODE === '1' ? demoMiddleware(c, next) : accessMiddleware(c, next);

app.use('/api/me/*', gate);
app.use('/', gate); // the demo console page

// The minter: download / view / rotate your own key (verified identity).
app.route('/api/me', mintRoutes);

// The demo console — a single self-contained page (behind Access).
app.get('/', (c) => c.html(CONSOLE_HTML));

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error('unhandled', c.req.method, c.req.path, err);
  return c.json({ error: 'internal error' }, 500);
});

export default { fetch: app.fetch };
