import assert from "node:assert/strict";
import { test } from "node:test";
import type { TaleclueView } from "@resenhark/shared";
import { type TaleclueState, tick } from "./engine.js";
import { project } from "./project.js";
import {
  act,
  cardOf,
  cfg,
  ctxAt,
  game,
  giveClue,
  narratorOf,
  others,
  playAllDecoys,
} from "./test-helpers.js";

/** True when the serialized view mentions the card id as a value. */
const sees = (view: TaleclueView, cardId: string) => JSON.stringify(view).includes(`"${cardId}"`);
const handsOf = (s: TaleclueState, id: string) => s.hands[id];

test("clue phase: a player sees only their own hand, a spectator sees none", () => {
  const { state } = game(4);
  const n = narratorOf(state);
  const view = project(state, n);
  assert.equal(view.phase, "clue");
  assert.equal(view.narratorId, n);
  assert.deepEqual(view.hand, state.hands[n]);
  assert.equal(view.clue, null);
  assert.deepEqual(view.table, []);
  assert.deepEqual(view.myCards, []);
  assert.deepEqual(view.acted, []);
  assert.equal(view.deadline, state.deadline);
  assert.equal(view.round, 1);
  assert.equal(view.decoyCount, 1);
  assert.equal(project(game(3).state, "zed").decoyCount, 2);
  for (const viewer of state.players.map((p) => p.id)) {
    const v = project(state, viewer);
    for (const other of state.players.map((p) => p.id).filter((id) => id !== viewer)) {
      for (const card of handsOf(state, other)) assert.equal(sees(v, card), false);
    }
  }
  const spectator = project(state, "zed");
  assert.deepEqual(spectator.hand, []);
  assert.equal(spectator.players.length, 4);
});

test("decoy phase: the clue is public, played cards and who played stay private", () => {
  const { state: clued } = giveClue(game(4).state);
  const n = narratorOf(clued);
  const narratorCard = clued.narratorCard as string;
  const [a, b] = others(clued);
  const aCard = clued.hands[a][0];
  const { state } = act(clued, a, { type: "play-decoys", cardIds: [aCard] });
  assert.equal(project(state, b).clue, "uma pista");
  assert.deepEqual(project(state, n).myCards, [narratorCard]);
  assert.deepEqual(project(state, a).myCards, [aCard]);
  assert.deepEqual(project(state, b).myCards, []);
  // Everyone sees who acted, but nobody sees a played card but its owner.
  for (const viewer of [n, a, b, "zed"]) assert.deepEqual(project(state, viewer).acted, [a]);
  assert.equal(sees(project(state, b), narratorCard), false);
  assert.equal(sees(project(state, b), aCard), false);
  assert.equal(sees(project(state, "zed"), aCard), false);
  assert.equal(sees(project(state, a), aCard), true);
  // The played card left the owner's hand.
  assert.equal(project(state, a).hand.includes(aCard), false);
  assert.deepEqual(project(state, "zed").table, []);
});

test("vote phase: the table is public and shuffled, authorship and votes stay hidden", () => {
  const { state } = playAllDecoys(giveClue(game(4).state).state);
  const n = narratorOf(state);
  const [a, b, c] = others(state);
  const expected = state.table.map((t) => t.cardId);
  for (const viewer of [n, a, "zed"]) {
    const v = project(state, viewer);
    assert.equal(v.phase, "vote");
    assert.deepEqual(v.table, expected);
    assert.equal(JSON.stringify(v).includes("ownerId"), false);
    assert.deepEqual(v.acted, []);
  }
  assert.deepEqual(project(state, a).myCards, cardOf(state, a));
  assert.deepEqual(project(state, n).myCards, cardOf(state, n));
  const voted = act(state, a, { type: "vote", cardId: cardOf(state, b)[0] }).state;
  assert.equal(project(voted, a).myVote, cardOf(state, b)[0]);
  assert.equal(project(voted, b).myVote, null);
  assert.equal(project(voted, c).myVote, null);
  assert.deepEqual(project(voted, c).acted, [a]);
  assert.equal(project(voted, "zed").myVote, null);
  // The vote of a is in nobody else's view: only the table ids, with no link to a.
  assert.equal(JSON.stringify(project(voted, c)).includes(`"${a}"`), true); // a is listed as acted
  assert.equal(JSON.stringify(project(voted, c)).includes("voterId"), false);
});

test("reveal: rounds carry the steps, my vote stays, the table stays", () => {
  const { state: table } = playAllDecoys(giveClue(game(4).state).state);
  const n = narratorOf(table);
  const [a, b, c] = others(table);
  let s = table;
  for (const id of [a, b, c]) {
    s = act(s, id, { type: "vote", cardId: cardOf(table, n)[0] }).state;
  }
  const v = project(s, "zed");
  assert.equal(v.phase, "reveal");
  assert.equal(v.rounds.length, 1);
  assert.deepEqual(
    v.rounds[0].steps.map((x) => x.type),
    ["card-flip", "votes", "award-correct", "award-decoy", "board-move"],
  );
  assert.equal(v.rounds[0].clue, "uma pista");
  assert.deepEqual(
    v.table,
    table.table.map((t) => t.cardId),
  );
  assert.equal(project(s, a).myVote, cardOf(table, n)[0]);
  assert.equal(v.players.find((p) => p.id === a)?.points, 2);
  assert.equal(v.players.find((p) => p.id === a)?.position, 2);
  assert.equal(v.nextNarratorId, s.order[1]);
});

test("positions are capped at the target and the game-over view hides hands and table", () => {
  const { state: table } = playAllDecoys(giveClue(game(4).state).state);
  const n = narratorOf(table);
  const [a, b, c] = others(table);
  table.points[a] = cfg.targetPoints + 5;
  let s = table;
  for (const id of [a, b, c]) s = act(s, id, { type: "vote", cardId: cardOf(table, n)[0] }).state;
  const over = tick(s, ctxAt(s.deadline)).state;
  const v = project(over, a);
  assert.equal(v.phase, "game-over");
  assert.equal(v.endReason, "points");
  assert.deepEqual(v.winners, [a]);
  assert.equal(v.players.find((p) => p.id === a)?.position, cfg.targetPoints);
  assert.deepEqual(v.hand, []);
  assert.deepEqual(v.table, []);
  assert.equal(v.deadline, null);
  assert.equal(v.narratorId, null);
  assert.equal(v.nextNarratorId, null);
  assert.equal(v.rounds.length, 1);
});

test("no event before the reveal carries a card or a vote", () => {
  const events = [] as ReturnType<typeof giveClue>["events"];
  const start = game(4);
  events.push(...start.events);
  const clued = giveClue(start.state);
  events.push(...clued.events);
  const decoys = playAllDecoys(clued.state);
  events.push(...decoys.events);
  const [a, b] = others(decoys.state);
  const voted = act(decoys.state, a, { type: "vote", cardId: cardOf(decoys.state, b)[0] });
  events.push(...voted.events);
  const everyCard = [
    ...decoys.state.table.map((t) => t.cardId),
    ...Object.values(decoys.state.hands).flat(),
  ];
  const text = JSON.stringify(events);
  for (const card of everyCard) assert.equal(text.includes(`"${card}"`), false, card);
  assert.equal(text.includes("cardId"), false);
  assert.equal(text.includes("voterId"), false);
});

test("in a later round the vote phase shows past rounds only, never the current owners or votes", () => {
  const { state: first } = playAllDecoys(giveClue(game(4).state).state);
  let s = first;
  const card = cardOf(first, narratorOf(first))[0];
  for (const id of others(first)) s = act(s, id, { type: "vote", cardId: card }).state;
  s = tick(s, ctxAt(s.deadline)).state;
  s = playAllDecoys(giveClue(s, 20_000).state, 20_000).state;
  assert.equal(s.phase, "vote");
  const view = project(s, others(s)[0]);
  assert.equal(view.round, 2);
  assert.equal(view.rounds.length, 1);
  assert.equal(view.rounds[0].round, 1);
  const current = JSON.stringify({ ...view, rounds: [] });
  assert.equal(current.includes("ownerId"), false);
  assert.equal(current.includes("voterId"), false);
});
