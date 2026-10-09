import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HUEHINT_CONFIG, type HuehintView, type RoomView } from "@resenhark/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HuehintBoard } from "../components/huehint/huehint-board";

const view: HuehintView = {
  mode: "group",
  cooperative: false,
  team: null,
  phase: "hint",
  config: DEFAULT_HUEHINT_CONFIG,
  round: 1,
  totalRounds: 3,
  giverId: "giver",
  nextGiverId: "guesser",
  color: { h: 317, s: 83, b: 71 },
  hint: null,
  submitted: [],
  myGuess: null,
  deadline: null,
  players: ["giver", "guesser", "absent"].map((id) => ({
    id,
    online: true,
    guessPoints: 0,
    giverPoints: 0,
    total: 0,
  })),
  rounds: [],
  winners: [],
  endReason: null,
};
const room: RoomView = {
  code: "ABCDE",
  you: "giver",
  ownerId: "giver",
  members: [
    {
      id: "giver",
      name: "Ana",
      avatar: { hue: 0, shape: "round" },
      online: true,
      isOwner: true,
      role: "player",
    },
    {
      id: "guesser",
      name: "Bia",
      avatar: { hue: 120, shape: "round" },
      online: true,
      isOwner: false,
      role: "player",
    },
    {
      id: "absent",
      name: "Caio",
      avatar: { hue: 240, shape: "round" },
      online: true,
      isOwner: false,
      role: "player",
    },
  ],
  lobby: {
    selectedGame: "huehint",
    huehintConfig: DEFAULT_HUEHINT_CONFIG,
    config: { targetCards: 10, contestSeconds: 10, guessSeconds: 60, maxPlayers: 15 },
    playlist: { source: "default", name: "Baralho ResenhARK", count: 40 },
    remaining: 40,
    smallPlaylist: false,
  },
  game: { type: "huehint", view },
  serverNow: 0,
};
function render(patch: Partial<HuehintView>, you = "giver") {
  return renderToStaticMarkup(
    createElement(HuehintBoard, {
      room: { ...room, you, game: { type: "huehint", view: { ...view, ...patch } } },
      events: [],
      send: async () => ({ ok: true as const }),
      connected: true,
      clock: { now: () => 0, sync: () => {} },
    }),
  );
}

test("secret colors have no HSB description in group hints or solo memory", () => {
  for (const markup of [render({}), render({ mode: "solo", phase: "memorize", giverId: null })]) {
    assert.match(markup, /aria-label="Cor secreta"/);
    assert.doesNotMatch(markup, /H \d+°|S \d+%|B \d+%/);
    assert.doesNotMatch(markup, /aria-label="[^"]*317/);
  }
});

test("target rendering is gated by role even when given an overbroad color field", () => {
  assert.match(render({}), /Só você vê esta cor/);
  for (const you of ["guesser", "spectator"]) {
    assert.doesNotMatch(render({}, you), /Cor secreta|H 317/);
    assert.doesNotMatch(render({ phase: "guessing", hint: "Azul" }, you), /Cor secreta|H 317/);
  }
  assert.match(
    render({ mode: "solo", phase: "memorize", giverId: null }, "guesser"),
    /Memorize esta cor/,
  );
  assert.doesNotMatch(
    render({ mode: "solo", phase: "guessing", giverId: null }, "guesser"),
    /Cor secreta|H 317/,
  );
  assert.match(render({ deadline: null }), /Tempo pausado/);
});

test("no-hint and missing guesses render without inventing server scores", () => {
  const round = {
    round: 1,
    giverId: "giver",
    color: { h: 317, s: 83, b: 71 },
    hint: null,
    outcome: "no-hint" as const,
    guesses: [],
    giverScore: null,
  };
  const markup = render({ phase: "reveal", color: null, rounds: [round] });
  assert.match(markup, /não deu dica/);
  assert.match(markup, /Cor real/);
  assert.doesNotMatch(markup, /sem palpite/);
  assert.doesNotMatch(markup, /Nota do dador/);
  const scored = render({
    phase: "reveal",
    color: null,
    rounds: [
      {
        ...round,
        outcome: "revealed",
        hint: "Azul",
        guesses: [{ playerId: "guesser", color: { h: 0, s: 100, b: 100 }, score: 8.52 }],
        giverScore: 8.52,
      },
    ],
  });
  assert.match(scored, /Nota: 8,52/);
  assert.match(scored, /Nota do dador/);
  assert.match(scored, /sem palpite/);
});

test("shared winners, split points and termination reason use the projection", () => {
  const markup = render({
    phase: "game-over",
    color: null,
    winners: ["giver", "guesser"],
    endReason: "not-enough-players",
    players: [{ id: "giver", online: true, guessPoints: 4.25, giverPoints: 8.52, total: 12.77 }],
  });
  assert.match(markup, /venceram/);
  assert.match(markup, /menos de 2 jogadores/);
  assert.match(markup, /Palpites: 4,25/);
  assert.match(markup, /Dicas: 8,52/);
  assert.match(markup, /12,77/);
});

function liveText(markup: string): string {
  return markup.match(/<div\b[^>]*aria-live="polite"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
}

test("memorize announces the solo player to spectators and instructions only to the player", () => {
  const solo = {
    mode: "solo" as const,
    phase: "memorize" as const,
    giverId: null,
    players: [view.players[0]],
  };
  const spectator = render(solo, "spectator");
  assert.doesNotMatch(spectator, /Memorize a cor\. Você tem 5 segundos\./);
  assert.match(liveText(spectator), /Ana está memorizando a cor/);
  assert.match(liveText(render(solo, "giver")), /Memorize a cor\. Você tem 5 segundos\./);
});
test("hint announcements address the giver and identify the giver to other players", () => {
  const giver = liveText(render({ phase: "hint" }, "giver"));
  assert.match(giver, /Sua vez: dê uma dica para a cor/);
  assert.doesNotMatch(giver, /Ana está pensando na dica/);
  const other = liveText(render({ phase: "hint", color: null }, "guesser"));
  assert.match(other, /Ana está pensando na dica/);
  assert.doesNotMatch(other, /Sua vez: dê uma dica para a cor/);
});

test("reveal renders the current round once and keeps only earlier rounds in the gallery", () => {
  const first = {
    round: 1,
    giverId: "giver",
    color: { h: 317, s: 83, b: 71 },
    hint: "Azul",
    outcome: "revealed" as const,
    guesses: [],
    giverScore: 0,
  };
  const single = render({ phase: "reveal", color: null, rounds: [first] });
  assert.equal((single.match(/aria-label="Revelação da rodada 1"/g) ?? []).length, 1);
  assert.doesNotMatch(single, /aria-label="Galeria de rodadas"/);
  const second = { ...first, round: 2 };
  const multiple = render({ phase: "reveal", round: 2, color: null, rounds: [first, second] });
  assert.equal((multiple.match(/aria-label="Revelação da rodada 1"/g) ?? []).length, 1);
  assert.equal((multiple.match(/aria-label="Revelação da rodada 2"/g) ?? []).length, 1);
  assert.equal((multiple.match(/<details\b/g) ?? []).length, 1);
  const finished = render({ phase: "game-over", round: 2, color: null, rounds: [first, second] });
  assert.equal((finished.match(/<details\b/g) ?? []).length, 2);
  assert.equal((finished.match(/aria-label="Revelação da rodada 1"/g) ?? []).length, 1);
  assert.equal((finished.match(/aria-label="Revelação da rodada 2"/g) ?? []).length, 1);
});

test("three-player result shows one winner or a shared win using only projected winners", () => {
  const players = [
    { id: "giver", online: true, guessPoints: 19.82, giverPoints: 18.73, total: 38.55 },
    { id: "guesser", online: true, guessPoints: 18.73, giverPoints: 19.82, total: 38.55 },
    { id: "absent", online: true, guessPoints: 10, giverPoints: 10, total: 20 },
  ];
  const unique = render({
    phase: "game-over",
    giverId: null,
    nextGiverId: null,
    color: null,
    winners: ["giver"],
    endReason: "rounds-done",
    players,
  });
  assert.doesNotMatch(unique, /Dica agora:|Próxima dica:|desempate|Empate dividido/);
  assert.match(unique, /Ana venceu!/);
  const shared = render({
    phase: "game-over",
    giverId: null,
    color: null,
    winners: ["giver", "guesser"],
    endReason: "rounds-done",
    players,
  });
  assert.match(shared, /Empate dividido: Ana e Bia venceram!/);
  assert.doesNotMatch(shared, /desempate/);
});

test("duo partial score has a provisional rank and no individual standings", () => {
  const markup = render({
    cooperative: true,
    team: { score: 15.5, max: 20, rank: "B", won: false },
  });
  assert.match(markup, /Nota da dupla/);
  assert.match(markup, /15,50 \/ 20,00/);
  assert.match(markup, /Rank provisório: B/);
  assert.match(markup, /B para vencer/);
  assert.doesNotMatch(markup, /Palpites:|Dicas:|Contribuições da dupla/);
});

for (const rank of ["S", "A", "B", "C", "D", "E"] as const) {
  test(`duo final rank ${rank} presents the collective outcome and unordered contributions`, () => {
    const won = ["S", "A", "B"].includes(rank);
    const markup = render({
      cooperative: true,
      phase: "game-over",
      endReason: "rounds-done",
      team: { score: 30.5, max: 40, rank, won },
      winners: won ? ["giver", "guesser"] : [],
      players: [
        { id: "giver", online: true, guessPoints: 4, giverPoints: 6, total: 10 },
        { id: "guesser", online: true, guessPoints: 16, giverPoints: 4.5, total: 20.5 },
      ],
    });
    assert.match(markup, new RegExp(`aria-label="Rank ${rank}"`));
    assert.match(markup, /Nota da dupla: 30,50 \/ 40,00/);
    assert.match(markup, won ? /A dupla venceu!/ : /A dupla não alcançou a meta B/);
    assert.match(markup, /Contribuições da dupla/);
    assert.match(markup, /Palpites: 4,00/);
    assert.match(markup, /Dicas: 6,00/);
    assert.ok(markup.indexOf("Palpites: 4,00") < markup.indexOf("Palpites: 16,00"));
    assert.doesNotMatch(markup, /Placar final|Ana venceu|Bia venceu|Empate dividido|<ol/);
    assert.match(liveText(markup), new RegExp(`Rank ${rank}`));
  });
}

test("early duo termination never shows rank or a win/loss, even with stale team data", () => {
  for (const endReason of ["ended", "not-enough-players"] as const) {
    for (const team of [null, { score: 38, max: 40, rank: "S" as const, won: true }]) {
      const markup = render({
        cooperative: true,
        phase: "game-over",
        endReason,
        team,
        winners: ["giver"],
      });
      assert.match(markup, /Partida encerrada/);
      assert.match(markup, endReason === "ended" ? /O dono encerrou/ : /menos de 2 jogadores/);
      assert.doesNotMatch(markup, /Rank|venceu|Vitória|derrota|meta B|Nota da dupla:/);
    }
  }
});

test("giver alternation names both players visibly and in live announcements", () => {
  const markup = render({ cooperative: true });
  assert.match(markup, /Dica agora: Ana · Próxima dica: Bia/);
  assert.match(liveText(markup), /Dica agora: Ana\. Próxima dica: Bia/);
  assert.match(
    render({ giverId: "guesser", nextGiverId: "giver" }),
    /Dica agora: Bia · Próxima dica: Ana/,
  );
  assert.match(render({ nextGiverId: null }), /Próxima dica: última rodada/);
});

test("next color is only available to the solo player during reveal", () => {
  assert.match(render({ mode: "solo", phase: "reveal" }), /Próxima cor/);
  assert.doesNotMatch(render({ mode: "solo", phase: "reveal" }, "spectator"), /Próxima cor/);
  assert.doesNotMatch(render({ mode: "group", phase: "reveal" }), /Próxima cor/);
  for (const phase of ["memorize", "guessing", "game-over"] as const) {
    assert.doesNotMatch(render({ mode: "solo", phase }), /Próxima cor/);
  }
});
