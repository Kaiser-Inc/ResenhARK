import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HITLINE_CONFIG } from "@resenhark/shared";
import { type Card, type HitlineState, apply, create } from "./engine.js";
import { project } from "./project.js";
import { card, deckOf, fixedCtx } from "./test-deck.js";

const hidden: Card = {
  ...card("hidden", 1987, "Secret Song Title", ["Secret Artist"]),
  isrc: "BRXXX8700001",
  spotifyUrl: "https://open.spotify.com/track/secret",
};
function leaksHiddenCard(view: unknown, h: Card): boolean {
  const json = JSON.stringify(view);
  return (
    json.includes(h.title) ||
    h.artists.some((a) => json.includes(a)) ||
    json.includes(String(h.year)) ||
    (h.isrc !== null && json.includes(h.isrc)) ||
    (h.spotifyUrl !== null && json.includes(h.spotifyUrl)) ||
    json.includes(h.id)
  );
}
// Visible cards use years 1950..1969 and titles "c<n>", so nothing collides with the hidden card.
function drawn() {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b", "c"], deckOf(30), fixedCtx());
  state.deck = [hidden, ...state.deck];
  const tp = state.players[state.turn].id;
  const r = apply(state, tp, { type: "draw" }, fixedCtx());
  assert.ok(r.ok);
  return { state: r.state, events: r.events, tp };
}
const viewers = (s: HitlineState) => [...s.players.map((p) => p.id), "spectator"];

test("no projection or event leaks the drawn card before the reveal", () => {
  const { state, events } = drawn();
  assert.equal(state.draw?.card.id, "hidden");
  for (const v of viewers(state))
    assert.equal(leaksHiddenCard(project(state, v), hidden), false, v);
  assert.equal(leaksHiddenCard(events, hidden), false);
  // the guess phase before the reveal: events of invalid actions leak nothing either
  for (const p of state.players) {
    const r = apply(state, p.id, { type: "draw" }, fixedCtx());
    assert.equal(leaksHiddenCard(r, hidden), false);
  }
});
test("the card is exposed only after the reveal", () => {
  const { state, tp } = drawn();
  const r = apply(state, tp, { type: "lock-guess", slot: 0, title: "t", artist: "a" }, fixedCtx());
  assert.ok(r.ok);
  assert.ok(leaksHiddenCard(project(r.state, "spectator"), hidden) === true);
  assert.equal(project(r.state, "spectator").draw, null);
});
test("the turn player sees their typed title and artist, others do not", () => {
  const { state, tp } = drawn();
  state.phase = "guessing";
  state.guess = { slot: 0, title: "Meu Palpite", artist: "Meu Artista" };
  const other = state.players.find((p) => p.id !== tp)?.id ?? "";
  assert.equal(project(state, tp).guess?.title, "Meu Palpite");
  assert.equal(project(state, tp).guess?.artist, "Meu Artista");
  assert.equal(project(state, other).guess?.title, undefined);
  assert.equal(project(state, "spectator").guess?.artist, undefined);
  assert.equal(JSON.stringify(project(state, other)).includes("Meu Palpite"), false);
  assert.equal(project(state, other).guess?.slot, 0);
});
test("deck contents are never projected, only the count", () => {
  const { state } = drawn();
  for (const v of viewers(state)) {
    const view = project(state, v);
    assert.equal(view.deckCount, state.deck.length);
    const json = JSON.stringify(view);
    for (const c of state.deck) assert.equal(json.includes(`"${c.title}"`), false);
  }
});
