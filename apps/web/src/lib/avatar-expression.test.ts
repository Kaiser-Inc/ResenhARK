import assert from "node:assert/strict";
import { test } from "node:test";

import { avatarExpression } from "./avatar-expression";

test("entry reactions prioritize error, appearance change, typing, then valid name", () => {
  const state = { failed: false, changed: false, typing: false, validName: false };
  assert.equal(avatarExpression(state), "idle");
  assert.equal(avatarExpression({ ...state, validName: true }), "happy");
  assert.equal(avatarExpression({ ...state, validName: true, typing: true }), "thinking");
  assert.equal(avatarExpression({ ...state, changed: true, typing: true }), "love");
  assert.equal(avatarExpression({ ...state, failed: true, changed: true, typing: true }), "sad");
});
