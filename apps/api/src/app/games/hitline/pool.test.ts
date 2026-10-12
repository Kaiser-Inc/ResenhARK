import assert from "node:assert/strict";
import { test } from "node:test";
import { seededRng } from "../../core/seeded-rng.js";
import type { CatalogCard } from "./catalog.js";
import { deckSize, drawBalanced, inDecades } from "./pool.js";

const card = (i: number, genre: number, year = 2000): CatalogCard => ({
  id: `cat-${i}`,
  title: `T${i}`,
  artists: ["A"],
  year,
  isrc: `ISRC${i}`,
  spotifyUrl: null,
  deezerId: i,
  genre,
});
const many = (from: number, n: number, genre: number) =>
  Array.from({ length: n }, (_, k) => card(from + k, genre));

test("inDecades keeps only the chosen decades", () => {
  const cards = [card(1, 132, 1955), card(2, 132, 1987), card(3, 132, 2021)];
  assert.deepEqual(
    inDecades(cards, ["pre60", "2020s"]).map((c) => c.id),
    ["cat-1", "cat-3"],
  );
});

test("deckSize is three times what the players need, at least 60", () => {
  assert.equal(deckSize(2, 5), 60);
  assert.equal(deckSize(4, 10), 120);
});

test("drawBalanced splits the deck evenly between genres and skips the rest", () => {
  const cards = [...many(0, 100, 132), ...many(1000, 100, 80), ...many(2000, 100, 152)];
  const deck = drawBalanced(cards, [132, 80], 60, seededRng(1));
  assert.equal(deck.length, 60);
  assert.equal(new Set(deck.map((c) => c.id)).size, 60);
  assert.equal(deck.filter((c) => c.genre === 132).length, 30);
  assert.equal(deck.filter((c) => c.genre === 80).length, 30);
});

test("drawBalanced gives a short genre's leftover quota to the others", () => {
  const cards = [...many(0, 100, 132), ...many(1000, 10, 80)];
  const deck = drawBalanced(cards, [132, 80], 60, seededRng(1));
  assert.equal(deck.length, 60);
  assert.equal(deck.filter((c) => c.genre === 80).length, 10);
});

test("drawBalanced stops at the pool size and is deterministic for a seed", () => {
  const cards = [...many(0, 20, 132), ...many(1000, 15, 80)];
  assert.equal(drawBalanced(cards, [132, 80], 60, seededRng(1)).length, 35);
  assert.deepEqual(
    drawBalanced(cards, [132, 80], 20, seededRng(7)).map((c) => c.id),
    drawBalanced(cards, [132, 80], 20, seededRng(7)).map((c) => c.id),
  );
});

test("drawBalanced over 8,000 songs takes under 100 ms", () => {
  const cards = Array.from({ length: 8000 }, (_, i) => card(i, [132, 80, 152, 78][i % 4]));
  const start = performance.now();
  drawBalanced(cards, [132, 80, 152, 78], 450, seededRng(3));
  assert.ok(performance.now() - start < 100);
});
