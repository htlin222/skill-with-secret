-- The allowlist + the only per-user state the minter needs.
--
-- There is deliberately NO key column. Keys are HMAC-derived from
-- STASH_KEY_SECRET + email + key_version at request time, so this table holds
-- only the non-secret salt: leaking the whole DB leaks no usable keys.
--
-- Revoke a single user by bumping their key_version (the minter does this on
-- rotate). Their previously downloaded `.skill` then 401s; nobody else moves.
CREATE TABLE IF NOT EXISTS users (
  email        TEXT PRIMARY KEY,
  key_version  INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL DEFAULT 0
);
