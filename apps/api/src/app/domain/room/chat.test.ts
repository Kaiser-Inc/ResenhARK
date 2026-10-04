import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMessage } from "./chat.js";
import { RateLimiter } from "./rate-limiter.js";

test("validateMessage accepts text and trims it", () => {
  assert.deepEqual(validateMessage("oi"), { ok: true, text: "oi" });
  assert.deepEqual(validateMessage("  oi  "), { ok: true, text: "oi" });
  assert.deepEqual(validateMessage("a".repeat(500)), { ok: true, text: "a".repeat(500) });
});

test("validateMessage rejects empty, blank, too long and non-string input", () => {
  const invalid = { ok: false, error: "invalid-message" };
  assert.deepEqual(validateMessage(""), invalid);
  assert.deepEqual(validateMessage("   "), invalid);
  assert.deepEqual(validateMessage("a".repeat(501)), invalid);
  assert.deepEqual(validateMessage(42), invalid);
  assert.deepEqual(validateMessage(null), invalid);
  assert.deepEqual(validateMessage(undefined), invalid);
});

test("RateLimiter allows 5 in the same instant, blocks the 6th, and recovers after the window", () => {
  const limiter = new RateLimiter(5, 5000);
  for (let i = 0; i < 5; i++) assert.equal(limiter.allow("ana", 1000), true);
  assert.equal(limiter.allow("ana", 1000), false);
  assert.equal(limiter.allow("ana", 1000 + 5001), true);
});

test("RateLimiter tracks each key separately", () => {
  const limiter = new RateLimiter(1, 5000);
  assert.equal(limiter.allow("ana", 0), true);
  assert.equal(limiter.allow("ana", 0), false);
  assert.equal(limiter.allow("bia", 0), true);
});

test("RateLimiter evicts idle keys once the window has passed", () => {
  const limiter = new RateLimiter(5, 5000);
  limiter.allow("ana", 0);
  limiter.allow("bia", 0);
  assert.equal(limiter.size(), 2);
  limiter.allow("caio", 5001);
  assert.equal(limiter.size(), 1);
});
