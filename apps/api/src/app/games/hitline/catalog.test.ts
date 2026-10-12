import assert from "node:assert/strict";
import { test } from "node:test";
import { HITLINE_GENRES, decadeOf } from "@resenhark/shared";
import { isPlausibleYear } from "../../../scripts/catalog/catalog-build.js";
import { seededRng } from "../../core/seeded-rng.js";
import { CATALOG } from "./catalog.js";
import entries from "./catalog.json" with { type: "json" };
import { drawBalanced } from "./pool.js";

const MIN_RANK = 300_000;
const genreIds = new Set<number>(HITLINE_GENRES.map((g) => g.id));

test("the catalog has at least 3,000 valid songs with unique ids and ISRCs", () => {
  assert.ok(entries.length >= 3000, `${entries.length} songs`);
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
  assert.equal(new Set(entries.map((e) => e.isrc)).size, entries.length);
  for (const e of entries) {
    assert.equal(e.id, `cat-${e.deezerId}`);
    assert.match(e.isrc, /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, e.title);
    assert.ok(isPlausibleYear(e.year), `${e.title}: ${e.year}`);
    assert.ok(genreIds.has(e.genre), `${e.title}: genre ${e.genre}`);
    assert.ok(e.rank >= MIN_RANK, `${e.title}: rank ${e.rank}`);
    assert.ok(e.title.length > 0 && e.artists.length > 0, e.title);
    assert.equal(typeof e.yearVerified, "boolean");
  }
});

test("every decade from the 60s and at least 18 genres have songs", () => {
  const decades = new Set(entries.map((e) => decadeOf(e.year)));
  for (const d of ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"] as const) {
    assert.ok(decades.has(d), d);
  }
  // The genre comes from the Deezer album, so a few genres stay thin or empty (Blues has no song
  // in the first build, Rap/Funk Brasileiro has 10): see report.md before relying on one.
  const populated = new Set(entries.map((e) => e.genre));
  assert.ok(populated.size >= 18, `${populated.size} genres have songs`);
});

test("a balanced draw over the real catalog takes under 100 ms", () => {
  const genres = HITLINE_GENRES.map((g) => g.id);
  const start = performance.now();
  drawBalanced(CATALOG, genres, 450, seededRng(1));
  assert.ok(performance.now() - start < 100);
});
