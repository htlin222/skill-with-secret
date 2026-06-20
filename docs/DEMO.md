# Public demo deploy (CI/CD)

A throwaway, **no-login** instance so anyone can try the paradigm: download a
real `.skill`, rotate it, watch the old one 401. It runs the same Worker with
`DEMO_MODE=1` (`wrangler.demo.toml`), which swaps Cloudflare Access for an
ephemeral per-browser cookie identity (`demo+<rand>@example.com`).

> ⚠️ Demo mode **intentionally bypasses the auth that is the whole point.** It's
> safe only because the instance is a sandbox: throwaway secret, disposable KV,
> ephemeral identities. Never set `DEMO_MODE` on the real instance.

## One-time setup — the fast way

One idempotent script does the whole thing via the wrangler CLI: creates the D1
+ KV, writes their ids into `wrangler.demo.toml`, sets a throwaway HMAC secret,
applies migrations, and deploys.

```bash
wrangler login          # once, if you haven't
pnpm setup:demo         # = bash scripts/setup-demo.sh
```

It prints the live `*.workers.dev` URL. Re-running is safe — it reuses existing
resources and just redeploys. Then commit the filled `wrangler.demo.toml` (its
ids aren't secret).

To also auto-deploy on every push to `main`, wire GitHub Actions:

```bash
pnpm setup:demo --ci    # sets CLOUDFLARE_ACCOUNT_ID via gh; reminds you re: the token
```

`CLOUDFLARE_API_TOKEN` is the one thing wrangler can't mint for you — create it
in the dashboard (My Profile → API Tokens → *Edit Cloudflare Workers* template,
which covers Workers Scripts / D1 / KV), then `gh secret set CLOUDFLARE_API_TOKEN`.
After that, `.github/workflows/deploy-demo.yml` redeploys on push.

## One-time setup — by hand

If you'd rather not run the script:

```bash
wrangler d1 create stash-demo-db          # → database_id into wrangler.demo.toml
wrangler kv namespace create STASH_KV     # → id into wrangler.demo.toml
wrangler secret put STASH_KEY_SECRET --config wrangler.demo.toml   # openssl rand -hex 32
wrangler d1 migrations apply stash-demo-db --remote --config wrangler.demo.toml
wrangler deploy --config wrangler.demo.toml
```

## What a visitor sees

1. Open the demo URL → an orange "🧪 Public demo mode" banner; no login.
2. Click **Download stash.skill** → a real bundle with a baked `.env`.
3. `put`/`get`/`ls` live in the page, or unzip and use the `stash` CLI.
4. Click **Rotate** → the previously downloaded skill now 401s. Re-download to
   recover. That's per-user revocation, live.

## First-deploy notes

- The `*.workers.dev` URL needs `workers.dev` enabled for your account (default
  on). It can take a minute to resolve after the first deploy.
- `wrangler d1 migrations apply` is idempotent — re-running each push is fine.
- Demo emails are reused per browser for a day (cookie `Max-Age`), so KV growth
  stays bounded. Periodically clear the demo KV namespace if you like.
