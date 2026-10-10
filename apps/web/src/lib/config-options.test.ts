import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TALECLUE_CONFIG, taleclueConfigSchema } from "@resenhark/shared";
import { HUEHINT_OPTIONS, TALECLUE_OPTIONS, withCurrent } from "./config-options";

test("Huehint uses the approved fixed times and one to five turns", () => {
  assert.deepEqual(HUEHINT_OPTIONS.hintSeconds, [15, 20, 30, 45, 60, 90]);
  assert.deepEqual(HUEHINT_OPTIONS.guessSeconds, [20, 30, 45, 60, 90, 120]);
  assert.deepEqual(HUEHINT_OPTIONS.turnsPerPlayer, [1, 2, 3, 4, 5]);
});

const BOUNDS = {
  targetPoints: [10, 50],
  clueSeconds: [30, 180],
  decoySeconds: [20, 120],
  voteSeconds: [20, 120],
  maxPlayers: [3, 8],
} as const;

test("every Taleclue option is accepted by the contract and sorted without repeats", () => {
  for (const [key, values] of Object.entries(TALECLUE_OPTIONS)) {
    assert.deepEqual(
      values,
      [...new Set(values)].sort((a, b) => a - b),
      key,
    );
    for (const value of values) {
      const parsed = taleclueConfigSchema.safeParse({ ...DEFAULT_TALECLUE_CONFIG, [key]: value });
      assert.equal(parsed.success, true, `${key}=${value}`);
    }
  }
});

test("each Taleclue list spans the whole contract range and contains the default", () => {
  for (const [key, [min, max]] of Object.entries(BOUNDS)) {
    const values = TALECLUE_OPTIONS[key as keyof typeof TALECLUE_OPTIONS];
    assert.equal(values[0], min, `${key} min`);
    assert.equal(values.at(-1), max, `${key} max`);
    const fallback = DEFAULT_TALECLUE_CONFIG[key as keyof typeof DEFAULT_TALECLUE_CONFIG];
    assert.equal(values.includes(fallback), true, `${key} default`);
  }
});

test("time and points use preset steps, not every integer", () => {
  assert.ok(TALECLUE_OPTIONS.targetPoints.length <= 8);
  assert.ok(TALECLUE_OPTIONS.clueSeconds.length <= 8);
  assert.ok(TALECLUE_OPTIONS.decoySeconds.length <= 8);
  assert.ok(TALECLUE_OPTIONS.voteSeconds.length <= 8);
  assert.deepEqual(TALECLUE_OPTIONS.maxPlayers, [3, 4, 5, 6, 7, 8]);
});

test("withCurrent keeps the list when the value is present and inserts it in order when not", () => {
  assert.deepEqual(withCurrent([10, 20, 30], 20), [10, 20, 30]);
  assert.deepEqual(withCurrent([10, 20, 30], 25), [10, 20, 25, 30]);
  assert.deepEqual(withCurrent([10, 20, 30], 5), [5, 10, 20, 30]);
});
