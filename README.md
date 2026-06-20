# skill-with-secret

> **Mint per-user, revocable Claude skills from your own Cloudflare Worker — the secret bakes itself into the skill at download time.**

A tiny, self-contained reference implementation of a paradigm: instead of
pasting an API key into every agent and every machine, your **server mints a
personalized [Agent Skill](https://docs.claude.com/en/docs/claude-code/skills)
on download** — a `.skill` bundle with a `.env` already baked in. The agent
unzips it and *immediately knows your infra*, authenticated, with a credential
that is **scoped to one person, derived not stored, and revocable with a single
integer.**

Runs free on Cloudflare Workers + KV + D1. No app-level auth code — Cloudflare
Access handles identity; this repo handles minting.

---

## The problem

Every time you start a new project, your agent doesn't know your private infra.
So you do one of two bad things:

1. **Re-explain it every session** — paste the base URL, the API shape, the key.
2. **Hand it a static API key** — which can't be revoked per-agent, leaks in
   plaintext across machines and chat logs, and is identical for everyone who
   has it. If your database leaks, every key leaks with it.

Static secrets don't fit a world where *agents* are the API consumers. You want
to hand each agent (each person, each laptop) its own credential, know who is
calling, and be able to kill exactly one of them without rotating everyone.

## The paradigm

**The skill carries its own secret, and the server mints it per user.**

```
┌─────────────┐   Access login    ┌──────────────────────────┐
│  browser    │ ────────────────▶ │  Worker: GET /api/me/skill│
│  (console)  │                   │  bakes .env { base,key,   │
└─────────────┘  ◀── stash.skill ─│  email } + zips skill/    │
                  (zip w/ .env)    └──────────────────────────┘
       │ unzip into ~/.claude/skills/
       ▼
┌─────────────┐   Bearer key +    ┌──────────────────────────┐
│  any agent  │   X-User-Email    │  Worker: /api/kv/*        │
│  (stash CLI)│ ────────────────▶ │  re-derives key, verifies │
└─────────────┘  ◀── data ────────│  (the ONLY gate, public)  │
└──────────────────────────┘
```

The key is never stored anywhere:

```
key = "stashk_" + base64url( HMAC-SHA256( SERVER_SECRET, `${email}:${version}` ) )
```

- **`SERVER_SECRET`** is one global Worker secret.
- **`version`** is a per-user integer in D1 — the *only* per-user state.
- To verify an incoming key, the Worker re-derives it from `(secret, email,
  version)` and constant-time compares. Nothing to look up, nothing to leak.

## Why everyone should adopt this

| Static API key | skill-with-secret |
|---|---|
| Stored in DB / env → leaks if either leaks | **Derived, never stored.** Leak the whole DB → zero usable keys |
| One key for everyone | **One key per person**, bound to their email by HMAC |
| Revoke = rotate the shared key = break everyone | **Revoke one user** by bumping their integer version |
| Agent must be told the URL + key by hand | **Baked into the skill** at download — agent just works |
| Can't tell who's calling | Every call carries a verified `email` |
| Anyone can probe "is this email a member?" | **Anti-enumeration:** unknown email and bad key are indistinguishable, with uniform timing |

This is the right shape for the agent era: a credential that is *minted*, *self-installing*, *attributable*, and *individually revocable* — with the auth boundary kept at the edge (Cloudflare Access), not reimplemented in your app.

## Quickstart

```bash
pnpm install
cp wrangler.toml.example wrangler.toml      # fill in ids (see docs/SETUP.md)
wrangler secret put STASH_KEY_SECRET         # openssl rand -hex 32
pnpm db:migrate:remote
pnpm deploy
```

Then put the minting routes behind Cloudflare Access (one command with
[`cf-gate`](https://github.com/) or the dashboard), open the console at your
Worker's URL, and click **Download stash.skill**. Full walkthrough:
[`docs/SETUP.md`](docs/SETUP.md).

## The 90-second demo

After unzipping the download into `~/.claude/skills/stash/`:

```bash
stash put demo "it works"     # ① the minted skill talks to your Worker
stash get demo                # → it works
#   …click "Rotate key" in the console…
stash get demo                # → 401: this skill was revoked   ← the whole point
#   …re-download, unzip, retry…
stash get demo                # → it works again
```

That `rotate → 401 → re-download` arc is the entire value proposition in three
commands: **a credential you can kill and re-mint, per person, in one click.**

There's also a browser path — the console page (`/`) can `put`/`get`/`ls`
against the protected resource live, so you can see the loop without a terminal.

## What's in here

```
worker/
  index.ts            # route wiring: public API (bearer) vs minting (Access)
  lib/apikey.ts       # HMAC key derivation + the anti-enumeration middleware ★
  lib/access.ts       # Cloudflare Access JWT verify (+ localhost dev bypass)
  routes/resource.ts  # the example protected resource — a per-user KV stash
  routes/mint.ts      # /key, /key/rotate, /skill (zips the bundle + baked .env)
  console.ts          # the self-contained demo page
skill/                # SOURCE OF TRUTH for the minted skill (SKILL.md + CLI)
scripts/gen-bundle.mjs# snapshots skill/ into the Worker (it has no filesystem)
migrations/0001_init.sql  # users(email, key_version) — the salt, never the key
```

Want this for *your* infra? Replace `routes/resource.ts` with your own
endpoints and rewrite `skill/` to drive them. The minting + auth machinery
(`apikey.ts`, `mint.ts`, `access.ts`, `gen-bundle.mjs`) is the reusable core —
that's the part you paste into every project.

## Security notes

- Keys are compared in constant time (`SubtleCrypto.timingSafeEqual` over fixed-
  length digests).
- The bearer middleware **fails closed** if `STASH_KEY_SECRET` is unset.
- The public resource path must be in your Cloudflare Access **Bypass** policy —
  the bearer key is then the only gate, by design.
- Unknown-email and wrong-key both return an identical `401` and run the same
  HMAC + compare work, so membership can't be enumerated by response or timing.
- Rotating a user's `key_version` is immediate and total for that user, and
  invisible to everyone else.

## License

MIT — see [LICENSE](LICENSE).
