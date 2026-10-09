import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HUEHINT_CONFIG, type HuehintConfig } from "@resenhark/shared";
import { fixedCtx } from "../hitline/test-deck.js";
import { SYSTEM_ACTOR } from "../system.js";
import { scoreGuess } from "./color.js";
import {
  type HuehintAction,
  type HuehintState,
  REVEAL_MS,
  apply,
  create,
  nextDeadline,
  tick,
  totals,
} from "./engine.js";

const cfg: HuehintConfig = { ...DEFAULT_HUEHINT_CONFIG, hintSeconds: 30, guessSeconds: 45 };
const HINT_MS = cfg.hintSeconds * 1000;
const GUESS_MS = cfg.guessSeconds * 1000;
const RED = { h: 355, s: 90, b: 85 };
const ORANGE = { h: 30, s: 90, b: 90 };

/** Group game with a fixed giver order (ids order) and fixed colors, at t=0 in the hint phase. */
function group(ids = ["a", "b", "c"], turns = 1): HuehintState {
  const { state } = create({ ...cfg, turnsPerPlayer: turns }, ids, fixedCtx());
  state.players = ids.map((id) => ({ id, online: true }));
  state.schedule = Array.from({ length: ids.length * turns }, (_, i) => ({
    giverId: ids[i % ids.length],
    color: i === 0 ? RED : { h: (i * 60) % 360, s: 70, b: 60 },
  }));
  return state;
}

function ok(r: ReturnType<typeof apply>) {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r;
}
const act = (s: HuehintState, actor: string, action: HuehintAction, now = 0) =>
  ok(apply(s, actor, action, fixedCtx(now)));
const err = (s: HuehintState, actor: string, action: HuehintAction) => {
  const r = apply(s, actor, action, fixedCtx());
  return r.ok ? null : r.error;
};
const hint = (text = "Vermelho McQueen") => ({ type: "give-hint" as const, hint: text });
const guess = (color = RED) => ({ type: "guess" as const, color });
/** Group game already in the guessing phase (giver "a" hinted at t=0). */
const guessing = (ids?: string[], turns?: number) => act(group(ids, turns), "a", hint()).state;

test("create schedules players × turnsPerPlayer rounds with the shuffled order repeated each lap", () => {
  const { state, events } = create({ ...cfg, turnsPerPlayer: 2 }, ["a", "b", "c"], fixedCtx(1000));
  const order = state.players.map((p) => p.id);
  assert.deepEqual(new Set(order), new Set(["a", "b", "c"]));
  assert.deepEqual(
    state.schedule.map((r) => r.giverId),
    [...order, ...order],
  );
  assert.equal(state.mode, "group");
  assert.equal(state.phase, "hint");
  assert.equal(state.deadline, 1000 + HINT_MS);
  assert.deepEqual(events, [
    { type: "game-started" },
    { type: "round-started", round: 1, giverId: order[0] },
  ]);
});

test("only the giver may give a hint, only during the hint phase", () => {
  const s = group();
  assert.equal(err(s, "b", hint()), "not-your-turn");
  assert.equal(err(s, "zed", hint()), "not-a-player");
  const after = act(s, "a", hint("  Vermelho McQueen ")).state;
  assert.equal(after.phase, "guessing");
  assert.equal(after.hint, "Vermelho McQueen");
  assert.equal(after.deadline, GUESS_MS);
  assert.equal(err(after, "a", hint()), "wrong-phase");
});

test("an invalid hint is rejected with invalid-hint", () => {
  const s = group();
  for (const bad of ["", "x".repeat(31), "Azul 2077", "#FF0000", "um dois tres quatro cinco"])
    assert.equal(err(s, "a", hint(bad)), "invalid-hint", bad);
  assert.equal(s.phase, "hint");
});

test("the giver cannot guess, a non-player cannot guess, a second guess is already-guessed", () => {
  assert.equal(err(group(), "b", guess()), "wrong-phase");
  const s = guessing();
  assert.equal(err(s, "a", guess()), "not-your-turn");
  assert.equal(err(s, "zed", guess()), "not-a-player");
  const once = act(s, "b", guess()).state;
  assert.equal(err(once, "b", guess(ORANGE)), "already-guessed");
});

test("the round reveals once every online guesser has guessed", () => {
  const one = act(guessing(), "b", guess());
  assert.equal(one.state.phase, "guessing");
  assert.deepEqual(one.events, [{ type: "guess-submitted", playerId: "b" }]);
  const two = act(one.state, "c", guess(ORANGE), 5000);
  assert.equal(two.state.phase, "reveal");
  assert.equal(two.state.deadline, 5000 + REVEAL_MS);
  assert.equal(two.state.results.length, 1);
  assert.ok(two.events.some((e) => e.type === "round-revealed"));
});

test("an offline guesser does not hold the round, but zero guesses never closes it early", () => {
  const cOff = act(guessing(), "c", { type: "set-online", online: false }).state;
  assert.equal(cOff.phase, "guessing");
  assert.equal(act(cOff, "b", guess()).state.phase, "reveal");
  const bothOff = act(cOff, "b", { type: "set-online", online: false }).state;
  assert.equal(bothOff.phase, "guessing");
});

test("a guesser who comes back before the deadline can still guess", () => {
  let s = act(guessing(), "c", { type: "set-online", online: false }).state;
  s = act(s, "c", { type: "set-online", online: true }).state;
  s = act(s, "b", guess()).state;
  assert.equal(s.phase, "guessing", "c is back online, so the round waits for c");
  assert.equal(act(s, "c", guess(ORANGE)).state.phase, "reveal");
});

test("guess deadline reveals with whoever guessed; non-guessers score nothing and stay out of the giver mean", () => {
  const s = act(guessing(), "b", guess(ORANGE)).state;
  assert.equal(tick(s, fixedCtx(GUESS_MS - 1)).state.phase, "guessing");
  const { state, events } = tick(s, fixedCtx(GUESS_MS));
  assert.equal(state.phase, "reveal");
  const [result] = state.results;
  assert.deepEqual(
    result.guesses.map((g) => g.playerId),
    ["b"],
  );
  assert.equal(result.giverScore, scoreGuess(RED, ORANGE));
  assert.deepEqual(totals(state).get("c"), { guess: 0, giver: 0 });
  assert.ok(events.some((e) => e.type === "round-revealed"));
});

test("giver score is the rounded mean in hundredths; zero guesses gives the giver 0", () => {
  let s = act(guessing(), "b", guess(RED)).state;
  s = act(s, "c", guess(ORANGE)).state;
  const [result] = s.results;
  assert.equal(result.giverScore, Math.round((1000 + scoreGuess(RED, ORANGE)) / 2));
  assert.equal(totals(s).get("a")?.giver, result.giverScore);
  assert.equal(totals(s).get("b")?.guess, 1000);

  const empty = tick(guessing(), fixedCtx(GUESS_MS)).state;
  assert.equal(empty.results[0].outcome, "revealed");
  assert.equal(empty.results[0].giverScore, 0);
});

test("hint deadline reveals the color with outcome no-hint and nobody scores", () => {
  const { state } = tick(group(), fixedCtx(HINT_MS));
  assert.equal(state.phase, "reveal");
  assert.deepEqual(state.results[0], {
    round: 1,
    giverId: "a",
    color: RED,
    hint: null,
    outcome: "no-hint",
    guesses: [],
    giverScore: null,
  });
  for (const t of totals(state).values()) assert.deepEqual(t, { guess: 0, giver: 0 });
});

test("reveal lasts 12 s and then the next giver's hint phase starts", () => {
  const revealed = tick(group(), fixedCtx(HINT_MS)).state;
  assert.equal(tick(revealed, fixedCtx(HINT_MS + REVEAL_MS - 1)).state.phase, "reveal");
  const { state, events } = tick(revealed, fixedCtx(HINT_MS + REVEAL_MS));
  assert.equal(state.phase, "hint");
  assert.equal(state.round, 1);
  assert.equal(state.deadline, HINT_MS + REVEAL_MS + HINT_MS);
  assert.deepEqual(events, [{ type: "round-started", round: 2, giverId: "b" }]);
});

/** Plays one round: the giver hints, the others guess `colors[id]`, then the reveal times out. */
function playRound(s: HuehintState, colors: Record<string, typeof RED>, now: number) {
  const giver = s.schedule[s.round].giverId as string;
  let next = act(s, giver, hint(), now).state;
  for (const p of next.players)
    if (p.id !== giver) next = act(next, p.id, guess(colors[p.id]), now).state;
  return tick(next, fixedCtx(now + REVEAL_MS));
}

test("the last reveal ends the game with rounds-done; highest total wins; exact tie is shared", () => {
  const tie = group(["a", "b"]);
  tie.schedule[1].color = RED;
  const r1 = playRound(tie, { b: RED }, 0);
  const r2 = playRound(r1.state, { a: RED }, 100_000);
  assert.equal(r2.state.phase, "game-over");
  assert.equal(r2.state.endReason, "rounds-done");
  assert.deepEqual(r2.state.winners, ["a", "b"]);
  assert.deepEqual(r2.events.at(-1), {
    type: "game-over",
    winners: ["a", "b"],
    reason: "rounds-done",
  });

  // Two players always mirror each other's points; a third breaks the symmetry.
  let w = group(["a", "b", "c"]);
  w.schedule[1].color = RED;
  w.schedule[2].color = RED;
  w = playRound(w, { b: RED, c: ORANGE }, 0).state;
  w = playRound(w, { a: ORANGE, c: ORANGE }, 100_000).state;
  const end = playRound(w, { a: ORANGE, b: RED }, 200_000).state;
  assert.equal(end.phase, "game-over");
  assert.deepEqual(end.winners, ["b"]);
});

test("equal top totals share the win even when their giver points differ", () => {
  const s = group(["a", "b", "c"]);
  const played = (
    round: number,
    giverId: string,
    giverScore: number,
    guesses: [string, number][],
  ) => ({
    round,
    giverId,
    color: RED,
    hint: "Vermelho McQueen",
    outcome: "revealed" as const,
    guesses: guesses.map(([playerId, score]) => ({ playerId, color: RED, score })),
    giverScore,
  });
  // After two rounds everyone has 1200, but the givers earned 800, 400 and 0.
  s.results = [
    played(1, "a", 800, [
      ["b", 800],
      ["c", 800],
    ]),
    played(2, "b", 400, [
      ["a", 400],
      ["c", 400],
    ]),
  ];
  s.round = 2;
  s.schedule[2].color = RED;
  const end = playRound(s, { a: RED, b: RED }, 200_000);
  assert.deepEqual(end.state.winners, ["a", "b", "c"]);
  assert.deepEqual(end.events.at(-1), {
    type: "game-over",
    winners: ["a", "b", "c"],
    reason: "rounds-done",
  });
});

test("with nobody online nothing ticks and nextDeadline is null; the first one back gets a fresh deadline", () => {
  let s = group();
  for (const id of ["a", "b", "c"]) s = act(s, id, { type: "set-online", online: false }).state;
  assert.equal(nextDeadline(s), null);
  assert.equal(tick(s, fixedCtx(10 * HINT_MS)).state.phase, "hint");
  s = act(s, "b", { type: "set-online", online: true }, 500_000).state;
  assert.equal(s.deadline, 500_000 + HINT_MS);
  assert.equal(nextDeadline(s), 500_000 + HINT_MS);
});

const remove = (s: HuehintState, playerId: string, now = 0) =>
  act(s, SYSTEM_ACTOR, { type: "remove", playerId }, now);

test("giver removed during the hint phase cancels the round without a reveal", () => {
  const { state, events } = remove(group(), "a");
  assert.equal(state.results.length, 0);
  assert.equal(state.phase, "hint");
  assert.equal(state.schedule[state.round].giverId, "b");
  assert.deepEqual(events, [
    { type: "round-canceled", giverId: "a" },
    { type: "round-started", round: 2, giverId: "b" },
  ]);
});

test("giver removed after the hint keeps the round going to the reveal", () => {
  let s = remove(guessing(), "a").state;
  assert.equal(s.phase, "guessing");
  s = act(s, "b", guess()).state;
  s = act(s, "c", guess()).state;
  assert.equal(s.phase, "reveal");
  assert.equal(s.results[0].giverId, "a");
});

test("removing a guesser drops their guess and can close the round", () => {
  let s = act(guessing(), "b", guess()).state;
  s = act(s, "c", guess(ORANGE)).state;
  assert.equal(s.phase, "reveal");
  let t = act(guessing(), "c", guess(ORANGE)).state;
  t = remove(t, "b").state;
  assert.equal(t.phase, "reveal", "c already guessed and is the only guesser left");
  assert.deepEqual(
    t.results[0].guesses.map((g) => g.playerId),
    ["c"],
  );
});

test("removing a player drops their future giver rounds", () => {
  const s = remove(group(["a", "b", "c"], 2), "c").state;
  assert.deepEqual(
    s.schedule.map((r) => r.giverId),
    ["a", "b", "a", "b"],
  );
});

test("giver removed in the last round ends the game", () => {
  const s = group();
  s.round = 2;
  const { state } = remove(s, "c");
  assert.equal(state.phase, "game-over");
  assert.equal(state.endReason, "rounds-done");
});

test("fewer than 2 players left ends the game with not-enough-players and winners by score", () => {
  const { state, events } = remove(group(["a", "b"]), "b");
  assert.equal(state.phase, "game-over");
  assert.equal(state.endReason, "not-enough-players");
  assert.deepEqual(state.winners, ["a"]);
  assert.deepEqual(events.at(-1), {
    type: "game-over",
    winners: ["a"],
    reason: "not-enough-players",
  });
});

test("end finishes with reason ended and no winners; nothing applies afterwards", () => {
  const { state } = act(group(), SYSTEM_ACTOR, { type: "end" });
  assert.equal(state.phase, "game-over");
  assert.equal(state.endReason, "ended");
  assert.deepEqual(state.winners, []);
  assert.equal(err(state, "a", hint()), "wrong-phase");
  assert.equal(nextDeadline(state), null);
});

test("only the system removes or ends; only players toggle their presence", () => {
  assert.equal(err(group(), "a", { type: "remove", playerId: "b" }), "wrong-phase");
  assert.equal(err(group(), SYSTEM_ACTOR, { type: "set-online", online: false }), "wrong-phase");
  assert.equal(err(group(), SYSTEM_ACTOR, { type: "remove", playerId: "zed" }), "not-a-player");
});

test("create with one player starts solo: 5 rounds, a 5 s memorize phase, no giver", () => {
  const { state, events } = create(cfg, ["a"], fixedCtx(1000));
  assert.equal(state.mode, "solo");
  assert.equal(state.schedule.length, 5);
  assert.ok(state.schedule.every((r) => r.giverId === null));
  assert.equal(state.phase, "memorize");
  assert.equal(state.deadline, 1000 + 5000);
  assert.deepEqual(events.at(-1), { type: "round-started", round: 1, giverId: null });
});

test("solo: memorize ends into guessing; a hint is never accepted", () => {
  const { state } = create(cfg, ["a"], fixedCtx());
  assert.equal(err(state, "a", hint()), "wrong-phase");
  assert.equal(err(state, "a", guess()), "wrong-phase");
  const { state: open, events } = tick(state, fixedCtx(5000));
  assert.equal(open.phase, "guessing");
  assert.equal(open.deadline, 5000 + GUESS_MS);
  assert.deepEqual(events, [{ type: "memorize-ended" }]);
});

test("solo: the guess reveals at once; the deadline reveals without a guess", () => {
  const open = tick(create(cfg, ["a"], fixedCtx()).state, fixedCtx(5000)).state;
  const target = open.schedule[0].color;
  const guessed = act(open, "a", guess(target), 4000).state;
  assert.equal(guessed.phase, "reveal");
  assert.deepEqual(guessed.results[0].guesses[0].score, 1000);
  assert.equal(guessed.results[0].giverScore, null);

  const missed = tick(open, fixedCtx(5000 + GUESS_MS)).state;
  assert.equal(missed.phase, "reveal");
  assert.deepEqual(missed.results[0].guesses, []);
});

test("solo: 5 rounds then game over with the player as winner", () => {
  let s = create(cfg, ["a"], fixedCtx()).state;
  let now = 0;
  for (let round = 0; round < 5; round++) {
    now += 5000;
    s = tick(s, fixedCtx(now)).state;
    s = act(s, "a", guess(s.schedule[s.round].color), now).state;
    now += REVEAL_MS;
    s = tick(s, fixedCtx(now)).state;
  }
  assert.equal(s.phase, "game-over");
  assert.equal(s.endReason, "rounds-done");
  assert.deepEqual(s.winners, ["a"]);
  assert.equal(totals(s).get("a")?.guess, 5000);
});

const next = { type: "next-round" as const };

test("solo: next-round skips the rest of the reveal; after the last round it ends the game", () => {
  let s = create(cfg, ["a"], fixedCtx()).state;
  s = tick(s, fixedCtx(5000)).state;
  s = act(s, "a", guess(), 6000).state;
  const { state, events } = act(s, "a", next, 7000);
  assert.equal(state.phase, "memorize");
  assert.equal(state.round, 1);
  assert.equal(state.deadline, 7000 + 5000);
  assert.deepEqual(events.at(-1), { type: "round-started", round: 2, giverId: null });

  s = state;
  for (let round = 1; round < 5; round++) {
    s = tick(s, fixedCtx(s.deadline)).state;
    s = act(s, "a", guess(), s.deadline - 1).state;
    s = act(s, "a", next, s.deadline - 1).state;
  }
  assert.equal(s.phase, "game-over");
  assert.equal(s.endReason, "rounds-done");
});

test("next-round is refused outside a solo reveal", () => {
  const solo = create(cfg, ["a"], fixedCtx()).state;
  assert.equal(err(solo, "a", next), "wrong-phase");
  assert.equal(err(tick(solo, fixedCtx(5000)).state, "a", next), "wrong-phase");
  const groupReveal = act(guessing(["a", "b"]), "b", guess()).state;
  assert.equal(groupReveal.phase, "reveal");
  assert.equal(err(groupReveal, "a", next), "wrong-phase");
  assert.equal(err(groupReveal, "b", next), "wrong-phase");
});

test("solo: the player leaving ends the game", () => {
  const { state } = act(create(cfg, ["a"], fixedCtx()).state, SYSTEM_ACTOR, {
    type: "remove",
    playerId: "a",
  });
  assert.equal(state.phase, "game-over");
  assert.equal(state.endReason, "ended");
});

test("everyone going offline mid-guessing pauses the round instead of revealing it", () => {
  let s = act(guessing(), "b", guess()).state;
  for (const id of ["a", "b", "c"]) s = act(s, id, { type: "set-online", online: false }).state;
  assert.equal(s.phase, "guessing");
  assert.equal(nextDeadline(s), null);
  s = act(s, "c", { type: "set-online", online: true }, 90_000).state;
  assert.equal(s.phase, "guessing");
  assert.equal(s.deadline, 90_000 + GUESS_MS);
});

test("create marks the game cooperative only when it starts with exactly 2 players", () => {
  const coop = (ids: string[]) => create(cfg, ids, fixedCtx()).state.cooperative;
  assert.equal(coop(["a", "b"]), true);
  assert.equal(coop(["a"]), false);
  assert.equal(coop(["a", "b", "c"]), false);
});

test("a game of 3 that drops to 2 stays competitive", () => {
  const s = act(group(["a", "b", "c"]), SYSTEM_ACTOR, { type: "remove", playerId: "c" }).state;
  assert.equal(s.players.length, 2);
  assert.equal(s.cooperative, false);
});
