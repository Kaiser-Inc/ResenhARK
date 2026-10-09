import assert from "node:assert/strict";
import { test } from "node:test";
import { HUEHINT_RANKS } from "@resenhark/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RulesPage from "../app/regras/page";
import { GameRules } from "../components/game-rules";
import { GAME_RULES, HUEHINT_RANK_RULES, currentSettings } from "./game-rules";

test("both games expose the approved short and full rules from one source", () => {
  assert.equal(GAME_RULES.hitline.summary, "Adivinhe o ano da música e monte sua linha do tempo.");
  assert.equal(GAME_RULES.huehint.summary, "Uma dica, uma cor. Quem chega mais perto?");
  assert.equal(GAME_RULES.hitline.rules.length, 4);
  assert.match(GAME_RULES.hitline.rules.join(" "), /5 a 15 cartas/);
  assert.match(GAME_RULES.huehint.rules.join(" "), /1 a 5 voltas/);
});

test("Huehint rules document cooperative play, alternation and shared group wins", () => {
  const text = GAME_RULES.huehint.rules.join(" ");
  assert.match(text, /exatamente 2 jogadores no início/);
  assert.match(text, /alternando a cada rodada/);
  assert.match(text, /B para vencer/);
  assert.match(text, /até 10 por rodada revelada/);
  assert.match(text, /rank é provisório/);
  assert.match(text, /3 ou mais jogadores/);
  assert.match(text, /dividem a vitória/);
  assert.match(text, /sem rank, vitória ou derrota/);
  assert.doesNotMatch(text, /desempate/i);
});

test("full rule surfaces show the shared rank thresholds and mark B as the target", () => {
  assert.deepEqual(
    HUEHINT_RANK_RULES.map(({ rank }) => rank),
    HUEHINT_RANKS.map(({ rank }) => rank),
  );
  for (const markup of [
    renderToStaticMarkup(createElement(GameRules, { game: "huehint" })),
    renderToStaticMarkup(createElement(RulesPage)),
  ]) {
    assert.match(markup, /Ranks da dupla · B para vencer/);
    assert.match(markup, /Vitória · Meta/);
    for (const { min } of HUEHINT_RANKS) assert.ok(markup.includes(`${min * 100}%`));
    assert.doesNotMatch(markup, /desempate/i);
  }
  assert.deepEqual(
    HUEHINT_RANK_RULES.map(({ result }) => result),
    ["Vitória", "Vitória", "Vitória", "Derrota", "Derrota", "Derrota"],
  );
});

test("home summaries omit the full rules and rank thresholds", () => {
  for (const game of ["hitline", "huehint"] as const) {
    const markup = renderToStaticMarkup(createElement(GameRules, { game, variant: "short" }));
    for (const rule of GAME_RULES[game].shortRules) assert.ok(markup.includes(rule));
    for (const rule of GAME_RULES[game].rules) assert.ok(!markup.includes(rule));
    assert.doesNotMatch(markup, /<table|95%|rank é provisório/);
  }
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
