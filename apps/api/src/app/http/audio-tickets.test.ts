import assert from "node:assert/strict";
import { test } from "node:test";
import { audioPath, audioTicket, verifyAudioTicket } from "./audio-tickets.js";

const secret = "s".repeat(32);

test("tickets verify only for the same draw and member", () => {
  const t = audioTicket(secret, "d1", "m1");
  assert.equal(verifyAudioTicket(secret, "d1", "m1", t), true);
  assert.equal(verifyAudioTicket(secret, "d2", "m1", t), false);
  assert.equal(verifyAudioTicket(secret, "d1", "m2", t), false);
  assert.equal(verifyAudioTicket("o".repeat(32), "d1", "m1", t), false);
  assert.equal(verifyAudioTicket(secret, "d1", "m1", "short"), false);
  assert.equal(verifyAudioTicket(secret, "d1", "m1", ""), false);
});

test("audioPath builds the proxy path with member and ticket", () => {
  const t = audioTicket(secret, "d1", "m1");
  assert.equal(audioPath(secret, "d1", "m1"), `/audio/d1?m=m1&t=${t}`);
});
