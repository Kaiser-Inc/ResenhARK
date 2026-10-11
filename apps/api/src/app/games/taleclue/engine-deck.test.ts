import assert from "node:assert/strict";
import { test } from "node:test";
import { create, tick } from "./engine.js";
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
  syntheticDeck,
} from "./test-helpers.js";

type State = ReturnType<typeof game>["state"];

/** One full round: clue, decoys, everyone votes the narrator's card, then the reveal ends. */
function playRound(s: State): State {
  const table = playAllDecoys(giveClue(s).state).state;
  const card = cardOf(table, narratorOf(table))[0];
  let cur = table;
  for (const id of others(table)) cur = act(cur, id, { type: "vote", cardId: card }).state;
  return tick(cur, ctxAt(cur.deadline)).state;
}

/** Every card the game holds, wherever it is. */
const allCards = (s: State) => [
  ...s.deck,
  ...s.discard,
  ...Object.values(s.hands).flat(),
  ...(s.narratorCard ? [s.narratorCard] : []),
  ...s.decoys.flatMap((d) => d.cardIds),
];

test("cards are conserved and never duplicated while playing round after round", () => {
  let s = game(4, 40).state;
  for (let i = 0; i < 6; i++) {
    s = playRound(s);
    const cards = allCards(s);
    assert.equal(cards.length, 40);
    assert.equal(new Set(cards).size, 40);
  }
});

test("when the draw pile runs out the discards are shuffled back, never the hands", () => {
  // 4 players need exactly 28 cards: hands 24 plus the 4 cards of round 1.
  let s = game(4, 28).state;
  const handsBefore = () => new Set(Object.values(s.hands).flat());
  s = playRound(s);
  s = playRound(s);
  // Round 3 had to recycle: the pile is empty again and the discards were drawn.
  const inHands = handsBefore();
  const cards = allCards(s);
  assert.equal(new Set(cards).size, 28);
  for (const card of s.deck) assert.equal(inHands.has(card), false);
  for (const p of s.players) assert.equal(s.hands[p.id].length, 6);
  assert.equal(s.round, 3);
  assert.equal(s.phase, "clue");
});

test("no card is dealt twice before the first recycle", () => {
  const s = game(4, 60).state;
  assert.equal(new Set(s.used).size, s.used.length);
  assert.equal(s.used.length, 24);
  let cur = s;
  for (let i = 0; i < 3; i++) cur = playRound(cur);
  assert.equal(new Set(cur.used).size, cur.used.length);
  assert.equal(cur.used.length, 24 + 3 * 4);
  assert.equal(cur.deck.length, 60 - cur.used.length);
});

test("used keeps every dealt card once, even after recycling", () => {
  let s = game(4, 28).state;
  for (let i = 0; i < 4; i++) s = playRound(s);
  assert.equal(s.used.length, 28);
  assert.equal(new Set(s.used).size, 28);
});

test("a deck too small for the first hands ends the game at once with deck-empty", () => {
  const { state, events } = create(cfg, ["a", "b", "c", "d"], syntheticDeck(20), ctxAt(0));
  assert.equal(state.phase, "game-over");
  assert.equal(state.endReason, "deck-empty");
  assert.deepEqual(
    events.map((e) => e.type),
    ["game-started", "game-over"],
  );
  assert.equal(state.winners.length, 4);
});

test("running out of cards between rounds ends the game with the leaders as winners", () => {
  const { state: table } = playAllDecoys(giveClue(game(4, 60).state).state);
  const card = cardOf(table, narratorOf(table))[0];
  let s = table;
  const [a, b] = others(table);
  for (const id of others(table)) s = act(s, id, { type: "vote", cardId: card }).state;
  // A deck too small to refill the hands: the round's 4 table cards cannot cover 3 missing more.
  s.deck = [];
  s.discard = [];
  s.hands[a] = s.hands[a].slice(3);
  s.points[a] = 5;
  s.points[b] = 5;
  const over = tick(s, ctxAt(s.deadline));
  assert.equal(over.state.phase, "game-over");
  assert.equal(over.state.endReason, "deck-empty");
  assert.ok(over.state.winners.includes(a) && over.state.winners.includes(b));
  assert.deepEqual(
    over.events.map((e) => e.type),
    ["game-over"],
  );
});
