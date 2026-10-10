import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_HUEHINT_CONFIG,
  DEFAULT_TALECLUE_CONFIG,
  type GameEvent,
  type RoomView,
  type TaleclueView,
} from "@resenhark/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LobbyPanel } from "../components/lobby/lobby-panel";
import { TaleclueBoard } from "../components/taleclue/taleclue-board";
import { gameErrorMessage } from "./game-errors";

const view: TaleclueView = {
  phase: "clue",
  config: DEFAULT_TALECLUE_CONFIG,
  round: 1,
  narratorId: "ana",
  nextNarratorId: "bia",
  clue: null,
  decoyCount: 2,
  hand: ["tc-010", "tc-011"],
  table: [],
  myCards: [],
  myVote: null,
  acted: [],
  players: ["ana", "bia", "caio"].map((id) => ({ id, online: true, points: 0, position: 0 })),
  deadline: 60000,
  rounds: [],
  winners: [],
  endReason: null,
};
const room: RoomView = {
  code: "ABCDE",
  you: "ana",
  ownerId: "ana",
  members: ["ana", "bia", "caio"].map((id, index) => ({
    id,
    name: ["Ana", "Bia", "Caio"][index],
    avatar: { hue: index * 120, shape: "round" as const },
    online: true,
    isOwner: index === 0,
    role: "player" as const,
  })),
  lobby: {
    selectedGame: "taleclue",
    taleclueConfig: DEFAULT_TALECLUE_CONFIG,
    huehintConfig: DEFAULT_HUEHINT_CONFIG,
    config: { targetCards: 10, contestSeconds: 10, guessSeconds: 60, maxPlayers: 15 },
    playlist: { source: "default", name: "Baralho ResenhARK", count: 40 },
    remaining: 40,
    smallPlaylist: false,
  },
  game: { type: "taleclue", view },
  serverNow: 0,
};
function render(patch: Partial<TaleclueView> = {}, you = "ana", now = 1000) {
  return renderToStaticMarkup(
    createElement(TaleclueBoard, {
      room: { ...room, you, game: { type: "taleclue", view: { ...view, ...patch } } },
      events: [],
      send: async () => ({ ok: true as const }),
      connected: true,
      clock: { now: () => now, sync: () => {} },
    }),
  );
}
test("only the narrator gets a clue input while every player sees their own hand", () => {
  assert.match(render(), /Enviar pista/);
  assert.match(render(), /Sua mão/);
  assert.match(render(), /data-card-id="tc-010"/);
  assert.doesNotMatch(render({}, "bia"), /Enviar pista/);
  assert.match(render({}, "bia"), /Ana está pensando na pista/);
  assert.doesNotMatch(render({ table: ["tc-099"] }), /data-card-id="tc-099"/);
});
test("decoys use the projected count and submitted players have no send control", () => {
  const patch = { phase: "decoy" as const, clue: "Porta 42" };
  assert.match(render(patch, "bia"), /Selecione 2 iscas/);
  assert.match(render({ ...patch, decoyCount: 1 }, "bia"), /Selecione 1 isca/);
  assert.doesNotMatch(render(patch), /Jogar iscas/);
  assert.doesNotMatch(render({ ...patch, acted: ["bia"] }, "bia"), /Jogar iscas/);
});
test("the vote table blocks own cards and shows no current authors or other votes", () => {
  const markup = render(
    { phase: "vote", table: ["tc-001", "tc-002"], myCards: ["tc-002"], clue: "Porta 42" },
    "bia",
  );
  assert.match(markup, /Sua carta/);
  assert.match(markup, /aria-label="Carta 2"[^>]*disabled/);
  assert.doesNotMatch(markup, /data-owner-id|data-voter-id/);
  assert.doesNotMatch(render({ phase: "vote", myVote: "tc-001" }, "bia"), /Confirmar voto/);
});
const round = {
  round: 1,
  narratorId: "ana",
  clue: "Porta 42",
  steps: [
    {
      type: "card-flip" as const,
      cards: [
        { cardId: "tc-001", ownerId: "ana", narrator: true },
        { cardId: "tc-002", ownerId: "bia", narrator: false },
      ],
    },
    { type: "votes" as const, votes: [{ voterId: "caio", cardId: "tc-001" }] },
    {
      type: "award-correct" as const,
      outcome: "some" as const,
      awards: [{ playerId: "ana", points: 3 }],
    },
    { type: "award-decoy" as const, awards: [{ playerId: "bia", points: 1 }] },
    { type: "board-move" as const, moves: [{ playerId: "ana", from: 2, to: 5 }] },
  ],
};
test("reveal seeks the projected steps and positions rather than restarting on reconnect", () => {
  const patch = {
    phase: "reveal" as const,
    rounds: [round],
    table: ["tc-001", "tc-002"],
    deadline: 16000,
    players: [{ id: "ana", online: true, points: 5, position: 5 }],
  };
  const start = render(patch, "ana", 1000);
  assert.match(start, /data-reveal-step="0"/);
  assert.match(start, /data-position="2"/);
  assert.doesNotMatch(start, /data-voter-id/);
  const votes = render(patch, "ana", 4000);
  assert.match(votes, /data-reveal-step="1"/);
  assert.match(votes, /data-voter-id="caio"/);
  const finish = render(patch, "ana", 13000);
  assert.match(finish, /data-reveal-step="4"/);
  assert.match(finish, /data-position="5"/);
  assert.match(finish, /[+]3/);
  assert.match(finish, /[+]1/);
});
test("Taleclue lobby exposes its config and requires three online players", () => {
  const lobby = renderToStaticMarkup(
    createElement(LobbyPanel, {
      room: { ...room, game: null, members: room.members.slice(0, 2) },
      send: async () => ({ ok: true as const }),
      connected: true,
    }),
  );
  assert.match(lobby, /Meta de pontos/);
  assert.match(lobby, /Tempo das iscas/);
  assert.match(lobby, /Iniciar partida/);
  assert.match(lobby, /disabled/);
  assert.match(lobby, /Precisa de pelo menos 3 jogadores online para começar/);
  const member = renderToStaticMarkup(
    createElement(LobbyPanel, {
      room: { ...room, game: null, you: "bia" },
      send: async () => ({ ok: true as const }),
      connected: true,
    }),
  );
  assert.match(member, /Jogo escolhido: Taleclue/);
  assert.doesNotMatch(member, /role="combobox"/);
});
test("Taleclue errors preserve the other games' hint and deck messages", () => {
  assert.match(gameErrorMessage("invalid-hint", "taleclue"), /Pista inválida/);
  assert.match(gameErrorMessage("invalid-hint"), /sem números/);
  assert.match(gameErrorMessage("no-deck", "taleclue"), /cartas suficientes/);
  assert.match(gameErrorMessage("no-deck"), /playlist/);
  for (const error of ["not-enough-players", "invalid-card", "own-card", "already-acted"] as const)
    assert.notEqual(gameErrorMessage(error), "Não deu certo. Tenta de novo.");
});

test("a remounted board restores the current draft but ignores a draft from another phase", () => {
  const draft = {
    key: "1:clue",
    selected: ["tc-010"],
    clue: "Porta 42",
    pending: false,
    submitted: false,
  };
  const props = {
    room,
    events: [],
    send: async () => ({ ok: true as const }),
    connected: true,
    clock: { now: () => 1000, sync: () => {} },
    draft,
  };
  const markup = renderToStaticMarkup(createElement(TaleclueBoard, props));
  assert.match(markup, /aria-label="Carta 1"[^>]*aria-pressed="true"/);
  assert.match(markup, /value="Porta 42"/);
  const next = renderToStaticMarkup(
    createElement(TaleclueBoard, {
      ...props,
      room: { ...room, game: { type: "taleclue", view: { ...view, phase: "decoy" } } },
    }),
  );
  assert.doesNotMatch(next, /aria-pressed="true"|value="Porta 42"/);
});

function renderState(
  patch: Partial<TaleclueView>,
  options: {
    you?: string;
    role?: "player" | "spectator";
    events?: GameEvent[];
    members?: RoomView["members"];
  } = {},
) {
  const you = options.you ?? "ana";
  const members = (options.members ?? room.members).map((member) =>
    member.id === you && options.role ? { ...member, role: options.role } : member,
  );
  return renderToStaticMarkup(
    createElement(TaleclueBoard, {
      room: { ...room, you, members, game: { type: "taleclue", view: { ...view, ...patch } } },
      events: options.events ?? [],
      send: async () => ({ ok: true as const }),
      connected: true,
      clock: { now: () => 1000, sync: () => {} },
    }),
  );
}
test("a spectator never renders a hand or personal vote markers even with a broad payload", () => {
  for (const phase of ["clue", "decoy", "vote"] as const) {
    const markup = renderState(
      { phase, table: ["tc-001"], myCards: ["tc-001"], myVote: "tc-001" },
      { role: "spectator" },
    );
    assert.match(markup, /Você está só olhando esta partida/);
    assert.doesNotMatch(
      markup,
      /Sua mão|Enviar pista|Jogar iscas|Confirmar voto|Sua carta|Seu voto|aria-pressed="true"/,
    );
    if (phase === "decoy") assert.match(markup, /Aguardando as iscas/);
    if (phase === "vote") assert.match(markup, /Aguardando os votos/);
  }
});
test("a paused game shows the pause status and read-only hand without an action", () => {
  const markup = renderState({ deadline: null });
  assert.match(markup, /Tempo pausado/);
  assert.match(markup, /Sua mão/);
  assert.doesNotMatch(markup, /Enviar pista|role="timer"/);
});
test("void and automatic decoy events become discrete status messages", () => {
  const markup = renderState(
    { phase: "vote" },
    {
      events: [
        { type: "round-voided", round: 1, narratorId: "ana", reason: "no-clue" },
        { type: "decoy-played", playerId: "departed-id", auto: true },
        { type: "decoy-played", playerId: "bia", auto: false },
      ],
    },
  );
  assert.match(markup, /Rodada anulada, sem pontos/);
  assert.match(markup, /Uma isca foi jogada automaticamente por departed-id/);
  assert.doesNotMatch(markup, /automaticamente por Bia/);
  assert.match(markup, /<output/);
});
test("every end reason renders the server result without a hand, clock or active narrator", () => {
  const reasons = {
    points: "Meta de pontos alcançada",
    "deck-empty": "O baralho acabou",
    "not-enough-players": "A partida ficou com menos de 3 jogadores",
    ended: "O dono encerrou a partida",
  };
  for (const endReason of Object.keys(reasons) as (keyof typeof reasons)[]) {
    const markup = renderState({ phase: "game-over", deadline: null, endReason, winners: ["ana"] });
    assert.match(markup, new RegExp(reasons[endReason]));
    assert.doesNotMatch(
      markup,
      /Sua mão|Enviar pista|Jogar iscas|Confirmar voto|Tempo pausado|role="timer"|Próximo narrador:/,
    );
    assert.match(markup, /Outra rodada/);
    if (endReason === "ended") {
      assert.match(markup, /Partida encerrada/);
      assert.doesNotMatch(markup, /venceu|venceram/);
    } else assert.match(markup, /Ana venceu!/);
  }
  assert.doesNotMatch(
    renderState({ phase: "game-over", endReason: "points" }, { you: "bia" }),
    /Outra rodada/,
  );
});
test("a shared victory and scores use the projected winners and points", () => {
  const markup = renderState({
    phase: "game-over",
    endReason: "points",
    winners: ["bia", "ana"],
    players: [{ id: "ana", online: true, points: 33, position: 30 }],
  });
  assert.match(markup, /Empate dividido: Bia, Ana venceram!/);
  assert.match(markup, /33 pontos/);
});
test("history contains only revealed rounds and does not duplicate the current reveal", () => {
  const current = { ...round, round: 2 };
  const during = renderState({
    phase: "reveal",
    round: 2,
    rounds: [round, current],
    deadline: 16000,
  });
  assert.match(during, /Rodadas anteriores/);
  assert.equal((during.match(/aria-label="Revelação da rodada 2"/g) ?? []).length, 1);
  assert.equal((during.match(/aria-label="Revelação da rodada 1"/g) ?? []).length, 1);
  const after = renderState({
    phase: "game-over",
    rounds: [round, current],
    deadline: null,
    endReason: "ended",
  });
  assert.match(after, /Rodadas anteriores/);
  assert.match(after, /Porta 42/);
  assert.doesNotMatch(renderState({ rounds: [] }), /Rodadas anteriores/);
});
test("revealed card owners and voters remain identifiable after they leave", () => {
  const markup = renderState(
    { phase: "game-over", endReason: "ended", rounds: [round] },
    { members: [room.members[0]] },
  );
  assert.match(markup, /data-owner-id="bia"/);
  assert.match(markup, />bia</);
  assert.match(markup, /data-voter-id="caio"/);
  assert.match(markup, />caio</);
});
test("all reveal outcomes come from the projected award step, including no votes", () => {
  for (const [outcome, text] of [
    ["some", "Alguns acertaram"],
    ["all", "Todos acertaram"],
    ["none", "Ninguém acertou"],
    ["no-votes", "Sem votos nesta rodada"],
  ] as const) {
    const projected = {
      ...round,
      steps: round.steps.map((step) =>
        step.type === "award-correct" ? { ...step, outcome, awards: [] } : step,
      ),
    };
    const markup = renderState({ phase: "game-over", endReason: "ended", rounds: [projected] });
    assert.match(markup, new RegExp(text));
    assert.doesNotMatch(markup, /[+]3/);
  }
});

test("a paused reveal keeps its projected result visible without restarting a timer", () => {
  const markup = renderState({ phase: "reveal", rounds: [round], deadline: null });
  assert.match(markup, /Tempo pausado/);
  assert.match(markup, /data-reveal-step="4"/);
  assert.match(markup, /data-voter-id="caio"/);
  assert.doesNotMatch(markup, /role="timer"/);
});
