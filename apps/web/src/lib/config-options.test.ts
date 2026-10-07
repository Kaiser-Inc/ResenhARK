import assert from "node:assert/strict";
import { test } from "node:test";
import { HUEHINT_OPTIONS } from "./config-options";

test("Huehint uses the approved fixed times and one to five turns", () => {
  assert.deepEqual(HUEHINT_OPTIONS.hintSeconds, [15, 20, 30, 45, 60, 90]);
  assert.deepEqual(HUEHINT_OPTIONS.guessSeconds, [20, 30, 45, 60, 90, 120]);
  assert.deepEqual(HUEHINT_OPTIONS.turnsPerPlayer, [1, 2, 3, 4, 5]);
});
