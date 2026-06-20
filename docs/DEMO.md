# Public demo deploy (CI/CD)

A throwaway, **no-login** instance so anyone can try the paradigm: download a
real `.skill`, rotate it, watch the old one 401. It runs the same Worker with
`DEMO_MODE=1` (`wrangler.demo.toml`), which swaps Cloudflare Access for an
ephemeral per-browser cookie identity (`demo+<rand>@example.com`).

> ⚠️ Demo mode **intentionally bypasses the auth that is the whole point.** It's
> safe only because the instance is a sandbox: throwaway secret, disposable KV,
> ephemeral identities. Never set `DEMO_MODE` on the real instance.

## One-time setup

```bash
# 1. Create the demo resources
wrangler d1 create stash-demo-db
wrangler kv namespace create STASH_KV
#    → paste both ids into wrangler.demo.toml

# 2. Set a throwaway HMAC secret on the demo worker
pnpm exec wrangler secret put STASH_KEY_SECRET --config wrangler.demo.toml
#    paste: $(openssl rand -hex 32)

# 3. Add GitHub repo secrets (Settings → Secrets → Actions)
#    CLOUDFLARE_API_TOKEN   — Workers Scripts:Edit, D1:Edit, KV:Edit
#    CLOUDFLARE_ACCOUNT_ID  — your account id
```

Commit the filled `wrangler.demo.toml` (its ids aren't secret). Push to `main`
— `.github/workflows/deploy-demo.yml` runs `gen-bundle`, applies migrations,
and deploys to `https://stash-demo.<your-subdomain>.workers.dev`.

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
