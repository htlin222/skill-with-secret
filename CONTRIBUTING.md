# Contributing

Thanks for your interest! This repo is small on purpose — a clean reference for
the "mint a per-user, revocable skill from your Worker" paradigm. Contributions
that keep it small and sharp are very welcome.

## Development

```bash
pnpm install
node scripts/gen-bundle.mjs   # snapshot skill/ into the Worker
pnpm typecheck
pnpm test
```

Run it locally in demo mode (no Cloudflare Access needed):

```bash
# wrangler.toml with DEMO_MODE="1" + a .dev.vars holding STASH_KEY_SECRET
pnpm db:migrate:local
pnpm dev
```

See [`docs/DEMO.md`](docs/DEMO.md) and [`docs/SETUP.md`](docs/SETUP.md).

## Ground rules

- **Keep the core minimal.** `lib/apikey.ts`, `routes/mint.ts`, `lib/access.ts`,
  and `scripts/gen-bundle.mjs` are the reusable paradigm. New *features* mostly
  belong in the example resource (`routes/resource.ts` + `skill/`), which forks
  are expected to replace anyway.
- **Don't weaken the security model.** Changes to key derivation, the constant-
  time compare, or the anti-enumeration behaviour need a clear rationale and a
  test. See [`SECURITY.md`](SECURITY.md).
- **`pnpm typecheck` and `pnpm test` must pass.** CI runs both on every PR.
- **Never commit secrets.** `.env`, `.dev.vars`, `wrangler.toml`, and
  `worker/generated/` are gitignored; keep it that way.

## Good first contributions

- Additional minted-key tests (timing, edge cases).
- Alternative example resources (an R2 blob host, a D1-backed notes API).
- Porting the skill body to other runtimes (a Node/Deno CLI alongside Python).

By contributing you agree your work is licensed under the repo's MIT license.
