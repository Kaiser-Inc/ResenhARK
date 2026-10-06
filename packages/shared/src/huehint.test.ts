import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_HUEHINT_CONFIG,
  hsbSchema,
  huehintConfigSchema,
  huehintIntentSchema,
  isValidHint,
} from "./huehint.js";

test("isValidHint accepts up to 30 chars and 4 words, no digits or #", () => {
  for (const ok of [
    "Vermelho McQueen",
    "  Azul Noite  ",
    "Laranja Corvete",
    "a b c d",
    "x".repeat(30),
  ])
    assert.equal(isValidHint(ok), true, ok);
  for (const bad of [
    "",
    "   ",
    "x".repeat(31),
    "um dois tres quatro cinco",
    "Azul 2077",
    "#FF0000",
    "h0 s100",
    "Azul ٣",
  ])
    assert.equal(isValidHint(bad), false, bad);
});

test("hsbSchema accepts integers in range only", () => {
  assert.equal(hsbSchema.safeParse({ h: 359, s: 100, b: 0 }).success, true);
  for (const c of [
    { h: 360, s: 0, b: 0 },
    { h: 0, s: 101, b: 0 },
    { h: 0, s: 0, b: -1 },
    { h: 1.5, s: 0, b: 0 },
  ])
    assert.equal(hsbSchema.safeParse(c).success, false, JSON.stringify(c));
});

test("huehintConfigSchema enforces the ranges and the default is valid", () => {
  assert.equal(huehintConfigSchema.safeParse(DEFAULT_HUEHINT_CONFIG).success, true);
  assert.equal(
    huehintConfigSchema.safeParse({ ...DEFAULT_HUEHINT_CONFIG, turnsPerPlayer: 5 }).success,
    true,
  );
  for (const patch of [
    { turnsPerPlayer: 6 },
    { turnsPerPlayer: 0 },
    { hintSeconds: 14 },
    { hintSeconds: 91 },
    { guessSeconds: 19 },
    { guessSeconds: 121 },
    { maxPlayers: 1 },
    { maxPlayers: 16 },
  ])
    assert.equal(
      huehintConfigSchema.safeParse({ ...DEFAULT_HUEHINT_CONFIG, ...patch }).success,
      false,
      JSON.stringify(patch),
    );
});

test("huehintIntentSchema parses give-hint and guess", () => {
  assert.equal(huehintIntentSchema.safeParse({ type: "give-hint", hint: "Azul" }).success, true);
  assert.equal(
    huehintIntentSchema.safeParse({ type: "guess", color: { h: 1, s: 2, b: 3 } }).success,
    true,
  );
  assert.equal(
    huehintIntentSchema.safeParse({ type: "guess", color: { h: 400, s: 2, b: 3 } }).success,
    false,
  );
  assert.equal(huehintIntentSchema.safeParse({ type: "draw" }).success, false);
});

test("huehintIntentSchema leaves the hint rules to the engine, so a long hint still parses", () => {
  const long = { type: "give-hint", hint: "x".repeat(500) };
  assert.equal(huehintIntentSchema.safeParse(long).success, true);
});
