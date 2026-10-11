import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameRules } from "../components/game-rules";
import { GameCard } from "../components/home/game-card";
import { GAME_RULES } from "./game-rules";

test("complete Taleclue rules use room deadlines and include scoring, absences and endings", () => {
  const markup = renderToStaticMarkup(
    createElement(GameRules, {
      game: "taleclue",
      setup: {
        type: "taleclue",
        config: {
          targetPoints: 37,
          clueSeconds: 120,
          decoySeconds: 45,
          voteSeconds: 35,
          maxPlayers: 8,
        },
      },
    }),
  );
  for (const text of [
    "recebe 6 cartas; com 3 jogadores, recebe 7 cartas e joga 2 iscas",
    "Pista:",
    "Iscas:",
    "Voto:",
    "Revelação:",
    "Prazo: 120 s",
    "Prazo: 45 s",
    "Prazo: 35 s",
    "alcança 37 pontos",
    "divide a vitória",
    "baralho não puder completar as mãos",
    "Se o dono encerrar a partida, não há vencedores",
    "rodada é anulada, sem pontos",
    "automaticamente",
    "seu voto não entra na pontuação",
    "Sem ninguém online, o tempo pausa",
    "espectador, sem mão",
    "sem limite",
    "os bônus das duas são somados",
    "Só votos enviados contam",
  ])
    assert.ok(markup.includes(text), text);
  assert.equal((markup.match(/<tr/g) ?? []).length, 5);
  assert.match(markup, /<th scope="col"[^>]*>Quem acertou/);
  assert.match(markup, /Ninguém votou/);
  assert.doesNotMatch(markup, /Prazo: 60 s|alcança 30 pontos/);
});

test("Taleclue home card has its own token and illustration with only short rules on its back", () => {
  const home = renderToStaticMarkup(createElement(GameCard, { game: "taleclue" }));
  assert.match(home, /data-game="taleclue"/);
  assert.match(home, /bg-game-taleclue/);
  assert.match(home, /data-story-cards/);
  const short = renderToStaticMarkup(
    createElement(GameRules, { game: "taleclue", variant: "short" }),
  );
  for (const text of GAME_RULES.taleclue.shortRules) assert.ok(short.includes(text));
  assert.doesNotMatch(short, /<table|rodada é anulada|sem ninguém online/i);
});
