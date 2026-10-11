import assert from "node:assert/strict";
import { test } from "node:test";
import { createTaleclueRevealProgress } from "./taleclue";

test("reveal progress freezes the observed deadline and resumes from the replacement deadline", () => {
  const progress = createTaleclueRevealProgress();
  const view = { phase: "reveal" as const, round: 1, deadline: 15000 };
  assert.equal(progress.read(view, 9600), 9600);
  assert.equal(progress.read({ ...view, deadline: null }, 10000), 10000);
  assert.equal(progress.read({ ...view, deadline: null }, 20000), 10000);
  assert.equal(progress.read({ ...view, deadline: 35000 }, 20000), 0);
  assert.equal(progress.read({ ...view, deadline: 35000 }, 30000), 10000);
});

test("a paused mount never invents unseen reveal progress or inherits another round", () => {
  const progress = createTaleclueRevealProgress();
  assert.equal(progress.read({ phase: "reveal", round: 1, deadline: null }, 5000), 0);
  assert.equal(progress.read({ phase: "reveal", round: 1, deadline: 20000 }, 10000), 5000);
  assert.equal(progress.read({ phase: "reveal", round: 2, deadline: null }, 10000), 0);
  assert.equal(progress.read({ phase: "clue", round: 2, deadline: null }, 10000), 15000);
  assert.equal(progress.read({ phase: "reveal", round: 2, deadline: null }, 10000), 0);
});
