import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HUEHINT_CONFIG, type Hsb } from "@resenhark/shared";
import { fixedCtx } from "../hitline/test-deck.js";
import { SYSTEM_ACTOR } from "../system.js";
import { type HuehintAction, type HuehintState, apply, create, tick } from "./engine.js";
import { project } from "./project.js";

// Distinct triples that no other field of a view can produce by accident.
const TARGET: Hsb = { h: 317, s: 83, b: 71 };
const FUTURE: Hsb = { h: 123, s: 45, b: 67 };
const GUESS_B: Hsb = { h: 201, s: 21, b: 31 };
const GUESS_C: Hsb = { h: 77, s: 13, b: 89 };
const leaks = (value: unknown, c: Hsb) =>
  JSON.stringify(value).includes(`"h":${c.h},"s":${c.s},"b":${c.b}`);

const VIEWERS = ["a", "b", "c", "spectator"];

function start() {
  const { state, events } = create(DEFAULT_HUEHINT_CONFIG, ["a", "b", "c"], fixedCtx());
  state.players = ["a", "b", "c"].map((id) => ({ id, online: true }));
  state.schedule = [
    { giverId: "a", color: TARGET },
    { giverId: "b", color: FUTURE },
    { giverId: "c", color: FUTURE },
  ];
  return { state, events };
}
function act(s: HuehintState, actor: string, action: HuehintAction) {
  const r = apply(s, actor, action, fixedCtx());
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r;
}

test("hint phase: only the giver sees the target; nobody sees a future color", () => {
  const { state } = start();
  assert.deepEqual(project(state, "a").color, TARGET);
  for (const v of VIEWERS) {
    if (v !== "a") {
      assert.equal(project(state, v).color, null, v);
      assert.equal(leaks(project(state, v), TARGET), false, v);
    }
    assert.equal(leaks(project(state, v), FUTURE), false, v);
  }
});

test("guessing phase: guesses stay with their author; everyone sees who guessed", () => {
  let s = act(start().state, "a", { type: "give-hint", hint: "Rosa Choque" }).state;
  s = act(s, "b", { type: "guess", color: GUESS_B }).state;
  assert.deepEqual(project(s, "a").color, TARGET);
  assert.deepEqual(project(s, "b").myGuess, GUESS_B);
  for (const v of VIEWERS) {
    const view = project(s, v);
    assert.equal(view.hint, "Rosa Choque");
    assert.deepEqual(view.submitted, ["b"]);
    assert.equal(leaks(view, FUTURE), false, v);
    if (v !== "a") assert.equal(leaks(view, TARGET), false, v);
    if (v !== "b") {
      assert.equal(view.myGuess, null, v);
      assert.equal(leaks(view, GUESS_B), false, v);
    }
  }
});

test("no event leaks the target or a guess before the reveal", () => {
  const { state, events } = start();
  const hinted = act(state, "a", { type: "give-hint", hint: "Rosa Choque" });
  const guessed = act(hinted.state, "b", { type: "guess", color: GUESS_B });
  for (const e of [...events, ...hinted.events, ...guessed.events]) {
    assert.equal(leaks(e, TARGET), false, e.type);
    assert.equal(leaks(e, GUESS_B), false, e.type);
    assert.equal(leaks(e, FUTURE), false, e.type);
  }
});

test("reveal: everyone sees the target, every guess and the scores with 2 decimals", () => {
  let s = act(start().state, "a", { type: "give-hint", hint: "Rosa Choque" }).state;
  s = act(s, "b", { type: "guess", color: TARGET }).state;
  const revealed = act(s, "c", { type: "guess", color: GUESS_C });
  const roundEvent = revealed.events.find((e) => e.type === "round-revealed");
  assert.ok(roundEvent && leaks(roundEvent, TARGET));
  for (const v of VIEWERS) {
    const view = project(revealed.state, v);
    assert.equal(view.phase, "reveal");
    assert.equal(view.color, null, "the target is shown through the gallery");
    assert.equal(leaks(view, FUTURE), false, v);
    const [round] = view.rounds;
    assert.deepEqual(round.color, TARGET);
    assert.equal(round.hint, "Rosa Choque");
    assert.deepEqual(
      round.guesses.map((g) => [g.playerId, g.score]),
      [
        ["b", 10],
        ["c", round.guesses[1].score],
      ],
    );
    assert.equal(Math.round(round.guesses[1].score * 100), round.guesses[1].score * 100);
    assert.equal(view.players.find((p) => p.id === "b")?.guessPoints, 10);
  }
});

test("round counters, giver, next giver and scores are 1-based and in points", () => {
  const view = project(start().state, "b");
  assert.equal(view.mode, "group");
  assert.equal(view.round, 1);
  assert.equal(view.totalRounds, 3);
  assert.equal(view.giverId, "a");
  assert.equal(view.nextGiverId, "b");
  assert.deepEqual(view.players[0], {
    id: "a",
    online: true,
    guessPoints: 0,
    giverPoints: 0,
    total: 0,
  });
});

test("game over: no future color, round stays at the last one, winners and reason are shown", () => {
  const over = act(start().state, SYSTEM_ACTOR, { type: "end" }).state;
  for (const v of VIEWERS) assert.equal(leaks(project(over, v), FUTURE), false);
  const view = project(over, "a");
  assert.equal(view.giverId, null);
  assert.equal(view.endReason, "ended");
  assert.equal(view.deadline, null);

  const done = tick(start().state, fixedCtx(10 ** 9)).state; // hint timeout -> reveal
  assert.equal(project(done, "a").rounds[0].outcome, "no-hint");
});

test("solo: memorize shows the color to the player only, then guessing hides it", () => {
  const { state } = create(DEFAULT_HUEHINT_CONFIG, ["a"], fixedCtx());
  state.schedule[0].color = TARGET;
  const view = project(state, "a");
  assert.equal(view.mode, "solo");
  assert.deepEqual(view.color, TARGET);
  assert.equal(view.giverId, null);
  assert.equal(leaks(project(state, "spectator"), TARGET), false);
  const open = tick(state, fixedCtx(5000)).state;
  assert.equal(project(open, "a").phase, "guessing");
  assert.equal(leaks(project(open, "a"), TARGET), false);
});
