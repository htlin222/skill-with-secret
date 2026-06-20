---
name: stash
description: Use when the user wants to read or write their private key/value "stash" — a personal store hosted on their own Cloudflare Worker. Verbs are put/get/ls/rm. The credential is baked into this skill's .env (minted per-user at download), so never ask for or print a key.
---

# stash — your private key/value store

This skill was **minted for one person**: the `.env` next to it carries that
user's personal API base, derived key, and email. Always shell out to the CLI;
never craft the HTTP request by hand or echo the bearer key.

Resolve the script from the injected **"Base directory for this skill"** value:

```bash
SKILL="<base directory for this skill>"
python3 "$SKILL/scripts/stash.py" <command> [args]
```

## Commands

| Goal | Command |
|---|---|
| Write a value | `stash put KEY VALUE` |
| Read a value | `stash get KEY` |
| List your keys | `stash ls` |
| Delete a value | `stash rm KEY` |
| Show whose key this is (masked) | `stash whoami` |

`put` prints `ok`; `get` prints the raw value on stdout; `ls` prints one key
per line. Errors go to stderr with a non-zero exit.

## If you see `401: this skill was revoked`

The user rotated their key on the console, which invalidates the `.env` shipped
in this download. Tell them to re-download `stash.skill` from the console and
unzip it over this folder. Nothing else to debug — rotation is by design.

## Don't

- Don't print the contents of `.env` or the bearer key in user-visible output.
- Don't construct the HTTP request yourself; the CLI handles auth headers.
- Don't ask the user to paste a key — it's baked in. If it's missing, the fix
  is always "re-download the skill," never "type the key here."

## Config (for reference)

`API_BASE`, `API_KEY`, `USER_EMAIL` come from the `.env` in this skill folder
(or matching process-env vars). See `.env.example`. The key is HMAC-derived
server-side and never stored — only this user's email + version can reproduce it.
