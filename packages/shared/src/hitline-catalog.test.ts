import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_DECADES,
  HITLINE_GENRES,
  OTHER_GENRE,
  decadeOf,
  decadesInputSchema,
  genresInputSchema,
  isHitlineGenre,
  sourceInputSchema,
} from "./hitline-catalog.js";

test("decadeOf groups everything before 1960 and clamps after the 2020s", () => {
  assert.equal(decadeOf(1928), "pre60");
  assert.equal(decadeOf(1959), "pre60");
  assert.equal(decadeOf(1960), "1960s");
  assert.equal(decadeOf(1987), "1980s");
  assert.equal(decadeOf(2026), "2020s");
  assert.equal(decadeOf(2031), "2020s");
});

test("the default decades are all but the one before the 60s", () => {
  assert.deepEqual(DEFAULT_DECADES, [
    "1960s",
    "1970s",
    "1980s",
    "1990s",
    "2000s",
    "2010s",
    "2020s",
  ]);
});

test("the genre list has the 21 Deezer genres plus Outros, with unique ids", () => {
  assert.equal(HITLINE_GENRES.length, 22);
  assert.equal(new Set(HITLINE_GENRES.map((g) => g.id)).size, 22);
  assert.ok(isHitlineGenre(OTHER_GENRE));
  assert.ok(isHitlineGenre(80)); // Sertanejo
  assert.equal(isHitlineGenre(95), false); // Infantil is out
});

test("input schemas reject unknown genres, empty decades and the playlist source", () => {
  assert.ok(genresInputSchema.safeParse({ genres: [132, 152] }).success);
  assert.ok(genresInputSchema.safeParse({ genres: [] }).success);
  assert.equal(genresInputSchema.safeParse({ genres: [95] }).success, false);
  assert.equal(genresInputSchema.safeParse({ genres: Array(50).fill(132) }).success, false);
  assert.ok(decadesInputSchema.safeParse({ decades: ["pre60"] }).success);
  assert.equal(decadesInputSchema.safeParse({ decades: [] }).success, false);
  assert.equal(decadesInputSchema.safeParse({ decades: ["1950s"] }).success, false);
  assert.ok(sourceInputSchema.safeParse({ source: "galera" }).success);
  assert.equal(sourceInputSchema.safeParse({ source: "playlist" }).success, false);
});
