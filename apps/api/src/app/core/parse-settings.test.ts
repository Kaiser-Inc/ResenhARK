import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSettings } from "./parse-settings.js";

const secret = "x".repeat(32);

test("development without SESSION_SECRET falls back to the dev default", () => {
  const result = parseSettings({ NODE_ENV: "development" });
  assert.ok(result.success);
  assert.ok(result.data.SESSION_SECRET.length >= 32);
});

test("production without SESSION_SECRET fails validation", () => {
  const result = parseSettings({ NODE_ENV: "production" });
  assert.equal(result.success, false);
  assert.ok(result.error?.flatten().fieldErrors.SESSION_SECRET);
});

test("production with a short SESSION_SECRET fails validation", () => {
  const result = parseSettings({ NODE_ENV: "production", SESSION_SECRET: "short" });
  assert.equal(result.success, false);
});

test("production with a 32+ char SESSION_SECRET passes and keeps it", () => {
  const result = parseSettings({ NODE_ENV: "production", SESSION_SECRET: secret });
  assert.ok(result.success);
  assert.equal(result.data.SESSION_SECRET, secret);
  assert.equal(result.data.PLAYLIST_SOURCE, "spotify");
});

test("E2E_SEED is honored only when NODE_ENV is test", () => {
  const seeded = parseSettings({ NODE_ENV: "test", E2E_SEED: "1" });
  assert.ok(seeded.success);
  assert.equal(seeded.data.E2E_SEED, 1);
  const dev = parseSettings({ NODE_ENV: "development", E2E_SEED: "1" });
  assert.ok(dev.success);
  assert.equal(dev.data.E2E_SEED, undefined);
  const unset = parseSettings({ NODE_ENV: "test" });
  assert.ok(unset.success);
  assert.equal(unset.data.E2E_SEED, undefined);
});
