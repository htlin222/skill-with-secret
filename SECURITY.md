# Security policy

`skill-with-secret` is a reference implementation of an auth paradigm, so its
security properties are the point. If you find a weakness, please report it.

## Reporting a vulnerability

Open a [private security advisory](https://github.com/htlin222/skill-with-secret/security/advisories/new)
on GitHub, or email the maintainer. Please **don't** open a public issue for a
real vulnerability. Expect an acknowledgement within a few days.

## The security model (what to hold us to)

- **Keys are derived, never stored.** A per-user key is
  `HMAC-SHA256(STASH_KEY_SECRET, "email:version")`. The database holds only the
  non-secret integer `key_version`. Compromising the D1 database alone must not
  yield a single usable key.
- **One global secret.** `STASH_KEY_SECRET` is a Worker secret, never committed,
  never in `[vars]`. The middleware fails closed if it's unset.
- **Constant-time comparison.** Presented keys are compared via
  `SubtleCrypto.timingSafeEqual` over fixed-length digests.
- **Anti-enumeration.** On the public resource path an unknown email and a wrong
  key return an identical `401` and perform the same HMAC + compare work, so
  membership cannot be probed by response shape or timing.
- **Per-user revocation.** Bumping a user's `key_version` invalidates their
  previously minted `.skill` and nothing else.
- **Auth at the edge.** Identity for minting comes from Cloudflare Access, not
  app code. The only app-level gate is the derived bearer key on the public API.

## Out of scope

- **Demo mode (`DEMO_MODE=1`).** It intentionally bypasses Cloudflare Access
  with an ephemeral cookie identity and is meant to run only on a throwaway
  sandbox instance. Issues that require demo mode on a *production* deploy are
  configuration mistakes, not vulnerabilities — never set `DEMO_MODE` there.
- A leaked `STASH_KEY_SECRET`. That secret is the root of trust; protect it like
  any signing key. Rotating it invalidates every minted skill at once.
