import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLUE_MAX_LENGTH,
  DEFAULT_TALECLUE_CONFIG,
  TALECLUE_CARDS,
  isValidClue,
  taleclueConfigSchema,
  taleclueIntentSchema,
} from "./taleclue.js";

test("the default config passes its own schema", () => {
  assert.deepEqual(taleclueConfigSchema.parse(DEFAULT_TALECLUE_CONFIG), DEFAULT_TALECLUE_CONFIG);
});

test("config bounds are enforced on every field", () => {
  const bad = (patch: object) =>
    taleclueConfigSchema.safeParse({ ...DEFAULT_TALECLUE_CONFIG, ...patch }).success;
  assert.equal(bad({ targetPoints: 9 }), false);
  assert.equal(bad({ targetPoints: 10 }), true);
  assert.equal(bad({ targetPoints: 50 }), true);
  assert.equal(bad({ targetPoints: 51 }), false);
  assert.equal(bad({ clueSeconds: 29 }), false);
  assert.equal(bad({ clueSeconds: 181 }), false);
  assert.equal(bad({ decoySeconds: 19 }), false);
  assert.equal(bad({ decoySeconds: 121 }), false);
  assert.equal(bad({ voteSeconds: 19 }), false);
  assert.equal(bad({ voteSeconds: 121 }), false);
  assert.equal(bad({ maxPlayers: 2 }), false);
  assert.equal(bad({ maxPlayers: 3 }), true);
  assert.equal(bad({ maxPlayers: 8 }), true);
  assert.equal(bad({ maxPlayers: 9 }), false);
  assert.equal(bad({ targetPoints: 10.5 }), false);
});

test("isValidClue trims, needs 1..30 chars and allows digits", () => {
  assert.equal(CLUE_MAX_LENGTH, 30);
  for (const ok of ["a", "  uma pista  ", "x".repeat(30), "sonho 2077"])
    assert.equal(isValidClue(ok), true, ok);
  for (const bad of ["", "   ", "x".repeat(31)]) assert.equal(isValidClue(bad), false, bad);
});

test("the intent schema accepts the three intents and rejects a malformed one", () => {
  const parse = (v: unknown) => taleclueIntentSchema.safeParse(v).success;
  assert.equal(parse({ type: "give-clue", cardId: "tc-001", clue: "pista" }), true);
  // A long clue must reach the engine, so it gets invalid-hint and not invalid-input.
  assert.equal(parse({ type: "give-clue", cardId: "tc-001", clue: "x".repeat(500) }), true);
  assert.equal(parse({ type: "play-decoys", cardIds: ["tc-002"] }), true);
  assert.equal(parse({ type: "vote", cardId: "tc-003" }), true);
  // The engine, not the schema, rejects a wrong number of decoys, so it answers invalid-card.
  assert.equal(parse({ type: "play-decoys", cardIds: Array(9).fill("tc-004") }), true);
  assert.equal(parse({ type: "play-decoys" }), false);
  assert.equal(parse({ type: "vote" }), false);
  assert.equal(parse({ type: "give-clue", cardId: "tc-001" }), false);
  assert.equal(parse({ type: "guess" }), false);
});

test("the deck is the 120-card manifest: opaque unique ids and one image per id", () => {
  assert.equal(TALECLUE_CARDS.length, 120);
  assert.equal(new Set(TALECLUE_CARDS.map((c) => c.id)).size, 120);
  for (const card of TALECLUE_CARDS) {
    assert.match(card.id, /^[0-9a-f]{8}$/);
    assert.equal(card.image, `/taleclue/cards/${card.id}.webp`);
    assert.ok(card.alt.length > 0, card.id);
  }
});
