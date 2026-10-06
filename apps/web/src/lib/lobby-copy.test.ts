import assert from "node:assert/strict";
import { test } from "node:test";
import { deckLabel, smallDeckWarning } from "./lobby-copy";

test("deck labels identify the default and imported decks", () => {
  assert.equal(
    deckLabel({ source: "default", name: "Baralho ResenhARK", count: 40 }),
    "Baralho ResenhARK · 40 músicas",
  );
  assert.equal(deckLabel({ source: "playlist", name: "Resenha", count: 3 }), "Resenha · 3 músicas");
});

test("small deck copy uses the actual player count, capacity and target", () => {
  assert.equal(smallDeckWarning(false, 2, 15, 10), null);
  assert.equal(
    smallDeckWarning(true, 1, 15, 10),
    "Baralho pequeno para 1 jogador com 10 cartas para vencer: a partida pode acabar antes de alguém vencer",
  );
  assert.equal(
    smallDeckWarning(true, 4, 2, 15),
    "Baralho pequeno para 2 jogadores com 15 cartas para vencer: a partida pode acabar antes de alguém vencer",
  );
  assert.match(smallDeckWarning(true, 0, 15, 5) ?? "", /1 jogador com 5 cartas/);
});
