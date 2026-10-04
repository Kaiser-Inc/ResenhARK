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
