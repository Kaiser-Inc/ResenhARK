import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HITLINE_CONFIG, hitlineConfigSchema } from "./hitline.js";

test("hitlineConfigSchema takes 5 to 15 cards to win", () => {
  const parse = (targetCards: number) =>
    hitlineConfigSchema.safeParse({ ...DEFAULT_HITLINE_CONFIG, targetCards }).success;
  assert.equal(parse(DEFAULT_HITLINE_CONFIG.targetCards), true);
  assert.equal(parse(5), true);
  assert.equal(parse(15), true);
  assert.equal(parse(4), false);
  assert.equal(parse(16), false);
});
