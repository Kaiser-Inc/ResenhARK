import assert from "node:assert/strict";
import { test } from "node:test";
import { levenshtein, matchesArtist, matchesTitle, normalizeTitle } from "./normalize.js";

const cases: [string, string, boolean][] = [
  ["mr brightside", "Mr. Brightside", true],
  ["bohemian rapsody", "Bohemian Rhapsody", true], // 1 typo
  ["evidencias", "Evidências", true],
  ["hey ya", "Hey Ya!", true],
  ["smells like teen spirit", "Smells Like Teen Spirit - Remastered 2021", true],
  ["imagine", "Imagine (Live)", true],
  ["blinding lights", "Blinding Lights (feat. Someone)", true],
  ["505", "505", true],
  ["five o five", "505", false], // accepted false negative
  ["wonderwall", "Champagne Supernova", false],
  ["", "505", false],
];
for (const [guess, answer, expected] of cases) {
  test(`matchesTitle(${JSON.stringify(guess)}, ${JSON.stringify(answer)}) is ${expected}`, () => {
    assert.equal(matchesTitle(guess, answer), expected);
  });
}

test("artist matches any of the track artists, ignoring a leading The", () => {
  assert.equal(matchesArtist("killers", ["The Killers"]), true);
  assert.equal(matchesArtist("bruno mars", ["Mark Ronson", "Bruno Mars"]), true);
  assert.equal(matchesArtist("queen", ["The Killers"]), false);
});

test("normalizeTitle strips bare feat/ft/featuring tails", () => {
  assert.equal(normalizeTitle("Song feat. Someone"), "song");
  assert.equal(normalizeTitle("Song ft. Someone"), "song");
  assert.equal(normalizeTitle("Song featuring Someone"), "song");
});

test("levenshtein basics", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("abc", "abc"), 0);
});
