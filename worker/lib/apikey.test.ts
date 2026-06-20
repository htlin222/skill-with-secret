import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveKey } from './apikey.ts';

// These lock the security invariants of the per-user key scheme. They use only
// Web Crypto (global in Node), so they run with `node --test` and no bundler.

const SECRET = 'test-secret-do-not-use-in-prod';

test('deterministic: same inputs reproduce the same key', async () => {
  const a = await deriveKey(SECRET, 'alice@example.com', 1);
  const b = await deriveKey(SECRET, 'alice@example.com', 1);
  assert.equal(a, b);
});

test('carries the stashk_ prefix', async () => {
  const k = await deriveKey(SECRET, 'alice@example.com', 1);
  assert.match(k, /^stashk_[A-Za-z0-9_-]+$/);
});

test('per-user: different emails derive different keys', async () => {
  const a = await deriveKey(SECRET, 'alice@example.com', 1);
  const b = await deriveKey(SECRET, 'bob@example.com', 1);
  assert.notEqual(a, b);
});

test('per-version: bumping the version (rotation) changes the key', async () => {
  const v1 = await deriveKey(SECRET, 'alice@example.com', 1);
  const v2 = await deriveKey(SECRET, 'alice@example.com', 2);
  assert.notEqual(v1, v2);
});

test('email is normalised: case/whitespace do not matter', async () => {
  const a = await deriveKey(SECRET, 'Alice@Example.com', 1);
  const b = await deriveKey(SECRET, '  alice@example.com  ', 1);
  assert.equal(a, b);
});

test('secret matters: a different global secret yields a different key', async () => {
  const a = await deriveKey(SECRET, 'alice@example.com', 1);
  const b = await deriveKey('a-different-secret', 'alice@example.com', 1);
  assert.notEqual(a, b);
});
