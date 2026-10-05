import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSettings } from "./parse-settings.js";

const secret = "x".repeat(32);
const adminPassword = "p".repeat(12);
const spotify = {
  SPOTIFY_CLIENT_ID: "id",
  SPOTIFY_CLIENT_SECRET: "secret",
  SPOTIFY_REDIRECT_URI: "https://api.example.com/admin/spotify/callback",
};

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
  const result = parseSettings({
    NODE_ENV: "production",
    SESSION_SECRET: secret,
    ADMIN_PASSWORD: adminPassword,
    ...spotify,
  });
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

test("production requires an ADMIN_PASSWORD of 12+ chars; development defaults it", () => {
  const missing = parseSettings({ NODE_ENV: "production", SESSION_SECRET: secret });
  assert.equal(missing.success, false);
  assert.ok(missing.error?.flatten().fieldErrors.ADMIN_PASSWORD);
  const short = parseSettings({
    NODE_ENV: "production",
    SESSION_SECRET: secret,
    ADMIN_PASSWORD: "short",
  });
  assert.equal(short.success, false);
  const dev = parseSettings({ NODE_ENV: "development" });
  assert.ok(dev.success);
  assert.equal(dev.data.ADMIN_PASSWORD, "dev");
});

test("TRUST_PROXY_HOPS defaults to 0", () => {
  const result = parseSettings({ NODE_ENV: "development", TRUST_PROXY_HOPS: "1" });
  assert.ok(result.success);
  assert.equal(result.data.TRUST_PROXY_HOPS, 1);
  const unset = parseSettings({ NODE_ENV: "development" });
  assert.ok(unset.success);
  assert.equal(unset.data.TRUST_PROXY_HOPS, 0);
});

test("PLAYLIST_SOURCE=spotify fails fast when any SPOTIFY_* is missing", () => {
  const base = { NODE_ENV: "production", SESSION_SECRET: secret, ADMIN_PASSWORD: adminPassword };
  for (const key of Object.keys(spotify) as (keyof typeof spotify)[]) {
    const { [key]: _omitted, ...rest } = spotify;
    const result = parseSettings({ ...base, ...rest });
    assert.equal(result.success, false, key);
    assert.ok(result.error?.flatten().fieldErrors[key]);
  }
  assert.ok(parseSettings({ ...base, ...spotify }).success);
});

test("PLAYLIST_SOURCE=fixture needs no Spotify credentials, even in production", () => {
  const result = parseSettings({
    NODE_ENV: "production",
    SESSION_SECRET: secret,
    ADMIN_PASSWORD: adminPassword,
    PLAYLIST_SOURCE: "fixture",
  });
  assert.ok(result.success);
});
