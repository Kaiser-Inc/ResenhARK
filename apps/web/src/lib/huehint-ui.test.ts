import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HUEHINT_CONFIG, type HuehintView, type RoomView } from "@resenhark/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HuehintBoard } from "../components/huehint/huehint-board";

const view: HuehintView = {
  mode: "group",
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

test("game over hides the giver line and explains a giver-points tiebreak", () => {
  const players = [
    { id: "giver", online: true, guessPoints: 19.82, giverPoints: 18.73, total: 38.55 },
    { id: "guesser", online: true, guessPoints: 18.73, giverPoints: 19.82, total: 38.55 },
  ];
  const tiebreak = render({
    phase: "game-over",
    giverId: null,
    nextGiverId: null,
    color: null,
    winners: ["giver"],
    endReason: "rounds-done",
    players,
  });
  assert.doesNotMatch(tiebreak, /Dador:/);
  assert.match(tiebreak, /Venceu no desempate pelas dicas/);
  const clear = render({
    phase: "game-over",
    giverId: null,
    color: null,
    winners: ["giver"],
    endReason: "rounds-done",
    players: [players[0], { ...players[1], total: 30 }],
  });
  assert.doesNotMatch(clear, /desempate/);
});

test("next color is only available to the solo player during reveal", () => {
  assert.match(render({ mode: "solo", phase: "reveal" }), /Próxima cor/);
  assert.doesNotMatch(render({ mode: "solo", phase: "reveal" }, "spectator"), /Próxima cor/);
  assert.doesNotMatch(render({ mode: "group", phase: "reveal" }), /Próxima cor/);
  for (const phase of ["memorize", "guessing", "game-over"] as const) {
    assert.doesNotMatch(render({ mode: "solo", phase }), /Próxima cor/);
  }
});
