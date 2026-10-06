import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_DECK } from "./default-deck.js";
import songs from "./default-deck.json" with { type: "json" };

test("the built-in deck has 450 to 500 songs from 1960 to 2026, each with a Deezer track and an ISRC", () => {
  assert.ok(songs.length >= 450 && songs.length <= 500, `${songs.length} songs`);
  for (const song of songs) {
    assert.ok(song.year >= 1960 && song.year <= 2026, `${song.title}: ${song.year}`);
    assert.ok(Number.isInteger(song.deezerId) && song.deezerId > 0, song.title);
    assert.match(song.isrc, /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, song.title);
  }
});

test("the built-in deck has no repeated song and a fifth to a third of Brazilian songs", () => {
  const keys = songs.map((s) => `${s.title.toLowerCase()}|${s.artists.join(",").toLowerCase()}`);
  assert.equal(new Set(keys).size, keys.length);
  const share = songs.filter((s) => s.br).length / songs.length;
  assert.ok(share >= 0.2 && share <= 0.3, `Brazilian share ${share}`);
});

test("DEFAULT_DECK cards carry the Deezer id and stable ids", () => {
  assert.equal(DEFAULT_DECK.cards.length, songs.length);
  assert.equal(DEFAULT_DECK.cards[0].id, "default-0");
  assert.equal(DEFAULT_DECK.cards[0].deezerId, songs[0].deezerId);
});
