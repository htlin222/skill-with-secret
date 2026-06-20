#!/usr/bin/env bash
# One-command provision + deploy of the PUBLIC demo instance (DEMO_MODE=1),
# entirely via the wrangler CLI. Idempotent: re-running reuses existing
# resources and just redeploys.
#
#   ./scripts/setup-demo.sh            # provision + deploy locally
#   ./scripts/setup-demo.sh --ci       # also wire GitHub Actions secrets via gh
#
# Prereqs: wrangler (logged in — run `wrangler login`), openssl, jq.
# The only thing wrangler can't mint for you is the CI API *token* (you create
# that in the dashboard); --ci sets the account id + reminds you about the token.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CFG="wrangler.demo.toml"
DB_NAME="stash-demo-db"
KV_BINDING="STASH_KV"
WANT_CI=0
[ "${1:-}" = "--ci" ] && WANT_CI=1

have() { command -v "$1" >/dev/null 2>&1; }
for t in wrangler openssl jq; do
  have "$t" || { echo "✗ missing required tool: $t" >&2; exit 1; }
done
wrangler whoami >/dev/null 2>&1 || { echo "✗ not logged in — run: wrangler login" >&2; exit 1; }

UUID_RE='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
HEX32_RE='[0-9a-fA-F]{32}'

# ---- 1. D1 database --------------------------------------------------------
echo "==> D1 database: $DB_NAME"
DB_ID="$(wrangler d1 list --json 2>/dev/null \
  | jq -r --arg n "$DB_NAME" '.[]|select(.name==$n)|.uuid' 2>/dev/null | head -n1 || true)"
if [ -z "${DB_ID:-}" ] || [ "$DB_ID" = "null" ]; then
  DB_ID="$(wrangler d1 create "$DB_NAME" | grep -oE "$UUID_RE" | head -n1 || true)"
fi
[ -n "${DB_ID:-}" ] || { echo "✗ could not resolve a database_id for $DB_NAME" >&2; exit 1; }
echo "    database_id = $DB_ID"

# ---- 2. KV namespace -------------------------------------------------------
echo "==> KV namespace: $KV_BINDING"
KV_ID="$(wrangler kv namespace list --json 2>/dev/null \
  | jq -r --arg b "$KV_BINDING" '.[]|select(.title|endswith($b))|.id' 2>/dev/null | head -n1 || true)"
if [ -z "${KV_ID:-}" ] || [ "$KV_ID" = "null" ]; then
  KV_ID="$(wrangler kv namespace create "$KV_BINDING" | grep -oE "$HEX32_RE" | head -n1 || true)"
fi
[ -n "${KV_ID:-}" ] || { echo "✗ could not resolve a KV namespace id for $KV_BINDING" >&2; exit 1; }
echo "    id = $KV_ID"

# ---- 3. patch wrangler.demo.toml (placeholders or prior ids) ---------------
echo "==> writing ids into $CFG"
python3 - "$CFG" "$DB_ID" "$KV_ID" <<'PY'
import re, sys
path, db, kv = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding="utf-8").read()
s = re.sub(r'database_id = "[^"]*"', f'database_id = "{db}"', s)
s = re.sub(r'(?m)^id = "[^"]*"', f'id = "{kv}"', s)
open(path, "w", encoding="utf-8").write(s)
PY

# ---- 4. HMAC secret (only if not already set) ------------------------------
echo "==> Worker secret: STASH_KEY_SECRET"
if wrangler secret list --config "$CFG" 2>/dev/null | jq -e '.[]|select(.name=="STASH_KEY_SECRET")' >/dev/null 2>&1; then
  echo "    already set — leaving it"
else
  openssl rand -hex 32 | wrangler secret put STASH_KEY_SECRET --config "$CFG"
fi

# ---- 5. schema + deploy ----------------------------------------------------
echo "==> applying D1 migrations"
node scripts/gen-bundle.mjs
wrangler d1 migrations apply "$DB_NAME" --remote --config "$CFG"

echo "==> deploying"
wrangler deploy --config "$CFG"

# ---- 6. optional: wire GitHub Actions for auto-deploy on push --------------
if [ "$WANT_CI" = "1" ]; then
  echo "==> wiring GitHub Actions secrets"
  if have gh && gh auth status >/dev/null 2>&1; then
    ACCOUNT_ID="$(wrangler whoami 2>/dev/null | grep -oE "$HEX32_RE" | head -n1 || true)"
    [ -n "$ACCOUNT_ID" ] && gh secret set CLOUDFLARE_ACCOUNT_ID --body "$ACCOUNT_ID" && echo "    set CLOUDFLARE_ACCOUNT_ID"
    echo "    ⚠ CLOUDFLARE_API_TOKEN must be created by you (dashboard → My Profile →"
    echo "      API Tokens → Edit Cloudflare Workers). Then run:"
    echo "        gh secret set CLOUDFLARE_API_TOKEN"
  else
    echo "    gh not available/authed — skipping. Set repo secrets manually (see docs/DEMO.md)."
  fi
fi

echo
echo "✓ done. Commit the filled $CFG (its ids aren't secret), then visit the"
echo "  printed *.workers.dev URL — you'll see the public demo console."
