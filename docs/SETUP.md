# Setup — deploy your own minter

End-to-end, from clone to a downloadable `.skill`. ~15 minutes. Everything fits
in Cloudflare's free tier.

## Prerequisites

- Node ≥ 20 and `pnpm`
- A Cloudflare account with **Zero Trust** enabled (free plan is fine)
- `wrangler` logged in: `pnpm dlx wrangler login`

## 1 — Install

```bash
pnpm install
cp wrangler.toml.example wrangler.toml
```

## 2 — Create the resources

```bash
# D1 (allowlist + key_version salt)
wrangler d1 create stash-db
#   → copy the printed database_id into wrangler.toml

# KV (the example protected resource)
wrangler kv namespace create STASH_KV
#   → copy the printed id into wrangler.toml
```

Apply the schema:

```bash
wrangler d1 migrations apply stash-db --remote
```

## 3 — Set the one global secret

Every per-user key is HMAC-derived from this. Generate a strong one and keep it
out of git (it's a Worker *secret*, never a `[vars]` entry):

```bash
wrangler secret put STASH_KEY_SECRET
#   paste: $(openssl rand -hex 32)
```

## 4 — Put the minting routes behind Cloudflare Access

The minter trusts the verified email from Access. Create an Access application
covering your Worker's hostname, with an allow policy for the emails you want to
hand skills to. Two paths:

- **Dashboard:** Zero Trust → Access → Applications → Add → Self-hosted →
  set the domain to your Worker URL → policy: *Allow* the emails / domain.
- **CLI:** if you use the `cf-gate` skill: `cf-gate gate <your-worker-host> you@example.com`

Then grab the application's **AUD tag** and your **team domain**
(`your-team.cloudflareaccess.com`) and put both into `[vars]` in
`wrangler.toml` (`CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`).

> **Critical:** add the **public resource path `/api/kv/*` to the Access
> *Bypass* policy.** External agents carry no Access session — the per-user
> bearer key is meant to be the only gate there. The `/` console and
> `/api/me/*` minting routes stay gated.

## 5 — Deploy

```bash
pnpm deploy        # runs gen-bundle, then wrangler deploy
```

## 6 — Mint your first skill

Open your Worker URL in a browser. Cloudflare Access prompts you to log in;
after that you land on the console. You'll see your email, key version, and a
masked key. Click **Download stash.skill**.

```bash
unzip ~/Downloads/stash.skill -d ~/.claude/skills/stash
```

Your agent now discovers the `stash` skill, and the baked `.env` means it can
read/write your private KV with no further setup.

## 7 — Smoke test (the demo)

```bash
python3 ~/.claude/skills/stash/scripts/stash.py put demo "it works"
python3 ~/.claude/skills/stash/scripts/stash.py get demo      # → it works
```

Now click **Rotate key** in the console, and run `get demo` again:

```bash
python3 ~/.claude/skills/stash/scripts/stash.py get demo
# → 401: this skill was revoked (key rotated). Re-download stash.skill…
```

Re-download, unzip over the folder, and it works again. That's per-user
revocation in one click.

## Local development

`wrangler dev` has no Access in front of it. Set the localhost bypass in
`.dev.vars`:

```
CF_ACCESS_TEAM_DOMAIN=localhost
CF_ACCESS_AUD=dev
STASH_KEY_SECRET=dev-secret-not-for-prod
```

```bash
pnpm db:migrate:local
pnpm dev
```

Then identify yourself with the `X-Dev-Email` header (the console fetches
`/api/me/*`, so pass it via a browser extension, or curl the endpoints):

```bash
curl -H 'X-Dev-Email: you@example.com' http://localhost:8787/api/me/key
```

## Making it yours

To wrap your *own* infra instead of the KV demo:

1. Replace `worker/routes/resource.ts` with your endpoints (keep
   `apiKeyMiddleware` on them — that's the per-user gate).
2. Rewrite `skill/SKILL.md` + `skill/scripts/stash.py` to drive your endpoints.
3. Add any new skill files to the `FILES` list in `scripts/gen-bundle.mjs`.
4. Redeploy. Users re-download to get the updated skill.

The minting core (`lib/apikey.ts`, `routes/mint.ts`, `lib/access.ts`,
`gen-bundle.mjs`) doesn't change — that's the reusable paradigm.
