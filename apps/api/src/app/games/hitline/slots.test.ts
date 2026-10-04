import assert from "node:assert/strict";
import { test } from "node:test";
import { correctSlot, insertAt, isCorrectSlot } from "./slots.js";
import { card } from "./test-deck.js";

test("slot between two years is correct when the year fits", () => {
  const tl = [card("a", 1990), card("b", 2000)];
  assert.equal(isCorrectSlot(tl, 1, 1995), true);
  assert.equal(isCorrectSlot(tl, 0, 1995), false);
  assert.equal(isCorrectSlot(tl, 2, 1995), false);
});
test("same year accepts both sides", () => {
  const tl = [card("a", 2007)];
  assert.equal(isCorrectSlot(tl, 0, 2007), true);
  assert.equal(isCorrectSlot(tl, 1, 2007), true);
});
test("empty timeline accepts slot 0", () => assert.equal(isCorrectSlot([], 0, 1980), true));
test("correctSlot returns the first valid gap and insertAt does not mutate", () => {
  const tl = [card("a", 1990), card("b", 2000)];
  assert.equal(correctSlot(tl, 1995), 1);
  assert.equal(correctSlot(tl, 2010), 2);
  assert.equal(correctSlot(tl, 1990), 0);
  const out = insertAt(tl, 1, card("x", 1995));
  assert.deepEqual(
    out.map((c) => c.id),
    ["a", "x", "b"],
  );
  assert.equal(tl.length, 2);
});
