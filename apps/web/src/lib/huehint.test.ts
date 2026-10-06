import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HUEHINT_CONFIG, type HuehintView } from "@resenhark/shared";
import { formatScore, hsbToCss, huehintScreen } from "./huehint";

test("HSB converts primary colors, white, black and intermediate brightness to CSS", () => {
  assert.equal(hsbToCss({ h: 0, s: 100, b: 100 }), "hsl(0 100.00% 50.00%)");
  assert.equal(hsbToCss({ h: 120, s: 100, b: 100 }), "hsl(120 100.00% 50.00%)");
  assert.equal(hsbToCss({ h: 240, s: 100, b: 100 }), "hsl(240 100.00% 50.00%)");
  assert.equal(hsbToCss({ h: 359, s: 0, b: 100 }), "hsl(359 0.00% 100.00%)");
  assert.equal(hsbToCss({ h: 90, s: 50, b: 0 }), "hsl(90 0.00% 0.00%)");
  assert.equal(hsbToCss({ h: 30, s: 50, b: 80 }), "hsl(30 50.00% 60.00%)");
});

test("server scores display two decimal places with a comma", () => {
  assert.equal(formatScore(0), "0,00");
  assert.equal(formatScore(10), "10,00");
  assert.equal(formatScore(8.52), "8,52");
});

const view: HuehintView = {
  mode: "group",
  phase: "hint",
  config: DEFAULT_HUEHINT_CONFIG,
  round: 1,
  totalRounds: 6,
  giverId: "giver",
  nextGiverId: "guesser",
  color: null,
  hint: null,
  submitted: [],
  myGuess: null,
  deadline: 1000,
  players: ["giver", "guesser"].map((id) => ({
    id,
    online: true,
    guessPoints: 0,
    giverPoints: 0,
    total: 0,
  })),
  rounds: [],
  winners: [],
  endReason: null,
};

test("phase and role gate every Huehint screen, including spectators and solo memory", () => {
  assert.equal(huehintScreen(view, "giver"), "hint");
  assert.equal(huehintScreen(view, "guesser"), "waiting");
  assert.equal(huehintScreen(view, "spectator"), "waiting");
  const guessing = { ...view, phase: "guessing" as const };
  assert.equal(huehintScreen(guessing, "giver"), "giver");
  assert.equal(huehintScreen(guessing, "guesser"), "guess");
  assert.equal(huehintScreen(guessing, "spectator"), "spectator");
  assert.equal(
    huehintScreen({ ...guessing, myGuess: { h: 20, s: 50, b: 50 } }, "guesser"),
    "submitted",
  );
  for (const you of ["giver", "guesser", "spectator"]) {
    assert.equal(huehintScreen({ ...view, phase: "reveal" }, you), "reveal");
    assert.equal(huehintScreen({ ...view, phase: "game-over" }, you), "result");
  }
  const solo = {
    ...view,
    mode: "solo" as const,
    giverId: null,
    phase: "memorize" as const,
    color: { h: 50, s: 80, b: 90 },
  };
  assert.equal(huehintScreen(solo, "guesser"), "memorize");
  assert.equal(huehintScreen({ ...solo, color: null }, "spectator"), "waiting");
  assert.equal(huehintScreen({ ...solo, phase: "guessing", color: null }, "guesser"), "guess");
});
