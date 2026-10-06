import assert from "node:assert/strict";
import { test } from "node:test";
import { GAME_RULES, currentSettings } from "./game-rules";

test("both games expose the approved short and full rules from one source", () => {
  assert.equal(GAME_RULES.hitline.summary, "Adivinhe o ano da música e monte sua linha do tempo.");
  assert.equal(GAME_RULES.huehint.summary, "Uma dica, uma cor. Quem chega mais perto?");
  assert.equal(GAME_RULES.hitline.rules.length, 4);
  assert.equal(GAME_RULES.huehint.rules.length, 5);
  assert.match(GAME_RULES.hitline.rules.join(" "), /5 a 15 cartas/);
  assert.match(GAME_RULES.huehint.rules.join(" "), /1 a 5 voltas/);
});

test("rules show the active configuration instead of hardcoded defaults", () => {
  assert.deepEqual(
    currentSettings({
      type: "hitline",
      config: { targetCards: 7, contestSeconds: 20, guessSeconds: 90, maxPlayers: 3 },
    }),
    [
      "Vence com 7 cartas",
      "Tempo de contestação: 20 s",
      "Tempo de palpite: 90 s",
      "Máximo de jogadores: 3",
    ],
  );
  assert.deepEqual(
    currentSettings({
      type: "huehint",
      config: { turnsPerPlayer: 4, hintSeconds: 45, guessSeconds: 90, maxPlayers: 6 },
    }),
    [
      "Voltas por jogador: 4",
      "Tempo da dica: 45 s",
      "Tempo de palpite: 90 s",
      "Máximo de jogadores: 6",
    ],
  );
});
