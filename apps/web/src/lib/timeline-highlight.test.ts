import assert from "node:assert/strict";
import { test } from "node:test";
import { timelineHighlightFor } from "./timeline-highlight";

const reveal = { receiverId: "receiver", card: { id: "revealed-card" } };

test("the revealed card highlights its receiver, including a successful contester", () => {
  assert.equal(timelineHighlightFor(reveal, "receiver", "revealed-card"), "revealed-card");
  assert.equal(timelineHighlightFor(reveal, "turn-player", "revealed-card"), null);
});

test("an unclaimed card does not highlight anyone", () => {
  assert.equal(
    timelineHighlightFor({ ...reveal, receiverId: null }, "receiver", "revealed-card"),
    null,
  );
});

test("expired and superseded highlights do not reappear", () => {
  assert.equal(timelineHighlightFor(reveal, "receiver", null), null);
  assert.equal(timelineHighlightFor(reveal, "receiver", "previous-card"), null);
});

test("no reveal means no highlight", () => {
  assert.equal(timelineHighlightFor(null, "receiver", "revealed-card"), null);
  assert.equal(timelineHighlightFor(undefined, "receiver", "revealed-card"), null);
});
