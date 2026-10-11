import assert from "node:assert/strict";
import { test } from "node:test";
import { pickDeck } from "./deck.js";
import { syntheticDeck } from "./test-helpers.js";

test("the pool is the cards the room has not dealt yet", () => {
  const all = syntheticDeck(84);
  const used = all.slice(0, 10);
  const r = pickDeck(all, used, 4);
  assert.ok(r.ok);
  assert.equal(r.pool.length, 74);
  assert.ok(r.pool.every((c) => !used.includes(c)));
  assert.deepEqual(r.used, used);
  // Everything is already unseen, so nothing needs priority.
  assert.deepEqual(r.priority, []);
});

test("when the unused cards cannot fill the hands the memory resets and the whole deck plays", () => {
  const all = syntheticDeck(40);
  // 4 players need 28; only 20 are unused.
  const r = pickDeck(all, all.slice(0, 20), 4);
  assert.ok(r.ok);
  assert.deepEqual(r.pool, all);
  assert.deepEqual(r.used, []);
  // The cards the room had not seen are still dealt first.
  assert.deepEqual(r.priority, all.slice(20));
});

test("exactly enough unused cards keeps the memory", () => {
  const all = syntheticDeck(40);
  const r = pickDeck(all, all.slice(0, 12), 4);
  assert.ok(r.ok);
  assert.equal(r.pool.length, 28);
  assert.equal(r.used.length, 12);
});

test("a deck smaller than the game needs is no-deck", () => {
  assert.deepEqual(pickDeck(syntheticDeck(27), [], 4), { ok: false });
  assert.deepEqual(pickDeck(syntheticDeck(26), [], 3), { ok: false });
  assert.equal(pickDeck(syntheticDeck(27), [], 3).ok, true);
});

test("used ids that are not in the deck are ignored", () => {
  const all = syntheticDeck(30);
  const r = pickDeck(all, ["ghost", ...all.slice(0, 2)], 4);
  assert.ok(r.ok);
  assert.equal(r.pool.length, 28);
});
