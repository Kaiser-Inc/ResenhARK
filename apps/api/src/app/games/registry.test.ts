import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HITLINE_CONFIG } from "@resenhark/shared";
import { create, nextDeadline } from "./hitline/engine.js";
import { deckOf, fixedCtx } from "./hitline/test-deck.js";
import {
  type ActiveGame,
  applyGame,
  gameDeadline,
  isRunning,
  parseIntent,
  projectGame,
} from "./registry.js";

function hitlineGame(): ActiveGame {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b"], deckOf(10), fixedCtx());
  return { type: "hitline", state, playerIds: ["a", "b"] };
}

test("applyGame routes a Hitline intent to the Hitline engine", () => {
  const game = hitlineGame();
  const turn = game.type === "hitline" ? game.state.players[game.state.turn].id : "";
  const r = applyGame(game, turn, { type: "draw" }, fixedCtx());
  assert.ok(r.ok);
  assert.equal(r.game.type, "hitline");
  assert.ok(r.events.some((e) => e.type === "card-drawn"));
});

test("applyGame passes engine rule errors through", () => {
  const game = hitlineGame();
  const other = game.type === "hitline" ? game.state.players[(game.state.turn + 1) % 2].id : "";
  assert.deepEqual(applyGame(game, other, { type: "draw" }, fixedCtx()), {
    ok: false,
    error: "not-your-turn",
  });
});

test("parseIntent validates with the active game's schema", () => {
  const game = hitlineGame();
  assert.deepEqual(parseIntent(game, { type: "draw" }), { ok: true, action: { type: "draw" } });
  assert.equal(parseIntent(game, { type: "guess", color: { h: 1, s: 1, b: 1 } }).ok, false);
});

test("projectGame tags the view with the game type", () => {
  const view = projectGame(hitlineGame(), "a");
  assert.equal(view.type, "hitline");
  assert.equal(view.type === "hitline" && view.view.phase, "turn-start");
});

test("gameDeadline and isRunning read the active game", () => {
  const game = hitlineGame();
  assert.equal(gameDeadline(game), game.type === "hitline" ? nextDeadline(game.state) : null);
  assert.equal(isRunning(game), true);
  assert.equal(isRunning(null), false);
  const ended = applyGame(game, "system", { type: "end" }, fixedCtx());
  assert.ok(ended.ok);
  assert.equal(isRunning(ended.game), false);
});
