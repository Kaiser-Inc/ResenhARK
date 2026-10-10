import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Ack,
  DEFAULT_TALECLUE_CONFIG,
  type RoomStatePayload,
  TALECLUE_CARDS,
  type TaleclueView,
} from "@resenhark/shared";
import type { Socket } from "socket.io-client";
import {
  type TestServer,
  type TestSession,
  connectClient,
  createRoomVia,
  joinRoomVia,
  startTestServer,
  stateWhere,
} from "../../test/helpers.js";

const emit = (socket: Socket, event: string, ...payload: unknown[]): Promise<Ack> =>
  socket.timeout(2000).emitWithAck(event, ...payload);

async function room(t: { after: (fn: () => void | Promise<void>) => void }, names: string[]) {
  const app: TestServer = await startTestServer();
  t.after(() => app.close());
  const owner = await createRoomVia(app, names[0]);
  const sessions: TestSession[] = [owner];
  for (const name of names.slice(1)) sessions.push(await joinRoomVia(app, owner.code, name));
  const clients: Socket[] = [];
  for (const s of sessions) clients.push(await connectClient(app.url, s.sessionToken));
  t.after(() => {
    for (const c of clients) c.close();
  });
  await stateWhere(clients[0], (s) => s.room.members.every((m) => m.online));
  return { app, sessions, clients, owner: clients[0] };
}

const tc = (s: RoomStatePayload): TaleclueView | undefined =>
  s.room.game?.type === "taleclue" ? s.room.game.view : undefined;

/** Selects Taleclue, starts it and returns each client's first Taleclue state. */
async function startTaleclue(
  clients: Socket[],
  config?: Record<string, number>,
): Promise<RoomStatePayload[]> {
  const owner = clients[0];
  assert.deepEqual(await emit(owner, "lobby:select-game", { game: "taleclue" }), { ok: true });
  if (config) {
    assert.deepEqual(await emit(owner, "lobby:configure-taleclue", config), { ok: true });
  }
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  return Promise.all(clients.map((c) => stateWhere(c, (s) => !!tc(s))));
}

/** Plays one full round through the sockets and resolves with each client's reveal state. */
async function playRound(
  clients: Socket[],
  sessions: TestSession[],
  states: RoomStatePayload[],
  pickVote: (table: string[], mine: string[]) => string = (table, mine) =>
    table.find((c) => !mine.includes(c)) as string,
): Promise<RoomStatePayload[]> {
  const narrator = sessions.findIndex((s) => s.memberId === tc(states[0])?.narratorId);
  assert.ok(narrator >= 0);
  const nView = tc(states[narrator]) as TaleclueView;
  assert.deepEqual(
    await emit(clients[narrator], "game:action", {
      type: "give-clue",
      cardId: nView.hand[0],
      clue: "uma pista",
    }),
    { ok: true },
  );
  const decoyStates = await Promise.all(
    clients.map((c) => stateWhere(c, (s) => tc(s)?.phase === "decoy")),
  );
  for (const [i, c] of clients.entries()) {
    if (i === narrator) continue;
    const v = tc(decoyStates[i]) as TaleclueView;
    const count = clients.length === 3 ? 2 : 1;
    assert.deepEqual(
      await emit(c, "game:action", { type: "play-decoys", cardIds: v.hand.slice(0, count) }),
      { ok: true },
    );
  }
  const voteStates = await Promise.all(
    clients.map((c) => stateWhere(c, (s) => tc(s)?.phase === "vote")),
  );
  for (const [i, c] of clients.entries()) {
    if (i === narrator) continue;
    const v = tc(voteStates[i]) as TaleclueView;
    assert.deepEqual(
      await emit(c, "game:action", { type: "vote", cardId: pickVote(v.table, v.myCards) }),
      { ok: true },
    );
  }
  return Promise.all(clients.map((c) => stateWhere(c, (s) => tc(s)?.phase === "reveal")));
}

test("owner selects Taleclue and every member sees the default config", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia", "Cid"]);
  assert.deepEqual(await emit(owner, "lobby:select-game", { game: "taleclue" }), { ok: true });
  const s = await stateWhere(clients[1], (x) => x.room.lobby.selectedGame === "taleclue");
  assert.deepEqual(s.room.lobby.taleclueConfig, DEFAULT_TALECLUE_CONFIG);
});

test("only the owner configures Taleclue, with valid input, and not while a game runs", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia", "Cid"]);
  const config = {
    targetPoints: 12,
    clueSeconds: 40,
    decoySeconds: 30,
    voteSeconds: 30,
    maxPlayers: 5,
  };
  assert.deepEqual(await emit(clients[1], "lobby:configure-taleclue", config), {
    ok: false,
    error: "not-owner",
  });
  assert.deepEqual(await emit(owner, "lobby:configure-taleclue", { ...config, targetPoints: 9 }), {
    ok: false,
    error: "invalid-input",
  });
  assert.deepEqual(await emit(owner, "lobby:configure-taleclue", { ...config, maxPlayers: 2 }), {
    ok: false,
    error: "invalid-input",
  });
  assert.deepEqual(await emit(owner, "lobby:configure-taleclue", config), { ok: true });
  const s = await stateWhere(clients[1], (x) => x.room.lobby.taleclueConfig.targetPoints === 12);
  assert.equal(s.room.lobby.taleclueConfig.maxPlayers, 5);
  await startTaleclue(clients);
  assert.deepEqual(await emit(owner, "lobby:configure-taleclue", config), {
    ok: false,
    error: "game-running",
  });
});

test("starting Taleclue with fewer than 3 online is not-enough-players", async (t) => {
  const { owner } = await room(t, ["Ana", "Bia"]);
  assert.deepEqual(await emit(owner, "lobby:select-game", { game: "taleclue" }), { ok: true });
  assert.deepEqual(await emit(owner, "game:start"), { ok: false, error: "not-enough-players" });
});

test("a full round over sockets: clue, decoys, votes, reveal, and a chat announcement", async (t) => {
  const { app, sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const states = await startTaleclue(clients);
  for (const s of states) {
    const v = tc(s) as TaleclueView;
    assert.equal(v.phase, "clue");
    assert.equal(v.hand.length, 7);
    assert.equal(v.rounds.length, 0);
  }
  assert.ok(states[0].events.some((e) => e.type === "game-started"));
  const history = await app.store.chatHistory(sessions[0].code);
  assert.ok(history.some((m) => m.text === "Partida de Taleclue começou"));

  const revealed = await playRound(clients, sessions, states);
  for (const s of revealed) {
    const v = tc(s) as TaleclueView;
    assert.equal(v.rounds.length, 1);
    assert.equal(v.rounds[0].steps.length, 5);
    assert.equal(v.table.length, 5);
  }
  assert.ok(revealed[0].events.some((e) => e.type === "round-revealed"));
});

/** Gets the room to the vote phase and resolves with each client's vote state and the narrator's index. */
async function toVote(clients: Socket[], sessions: TestSession[], states: RoomStatePayload[]) {
  const narrator = sessions.findIndex((s) => s.memberId === tc(states[0])?.narratorId);
  const nView = tc(states[narrator]) as TaleclueView;
  await emit(clients[narrator], "game:action", {
    type: "give-clue",
    cardId: nView.hand[0],
    clue: "uma pista",
  });
  const decoyStates = await Promise.all(
    clients.map((c) => stateWhere(c, (s) => tc(s)?.phase === "decoy")),
  );
  for (const [i, c] of clients.entries()) {
    if (i === narrator) continue;
    const v = tc(decoyStates[i]) as TaleclueView;
    await emit(c, "game:action", { type: "play-decoys", cardIds: v.hand.slice(0, v.decoyCount) });
  }
  const voteStates = await Promise.all(
    clients.map((c) => stateWhere(c, (s) => tc(s)?.phase === "vote")),
  );
  return { narrator, voteStates };
}

test("votes sent at the same time all count and the round reveals once", async (t) => {
  const { clients, sessions } = await room(t, ["Ana", "Bia", "Cid", "Dan"]);
  const states = await startTaleclue(clients);
  const { narrator, voteStates } = await toVote(clients, sessions, states);
  const voters = clients.map((_, i) => i).filter((i) => i !== narrator);
  const acks = await Promise.all(
    voters.map((i) => {
      const v = tc(voteStates[i]) as TaleclueView;
      const cardId = v.table.find((c) => !v.myCards.includes(c)) as string;
      return emit(clients[i], "game:action", { type: "vote", cardId });
    }),
  );
  assert.deepEqual(acks, [{ ok: true }, { ok: true }, { ok: true }]);
  const revealed = await stateWhere(clients[0], (s) => tc(s)?.phase === "reveal");
  const round = (tc(revealed) as TaleclueView).rounds[0];
  const votes = round.steps.find((s) => s.type === "votes");
  assert.ok(votes && votes.type === "votes");
  assert.equal(votes.votes.length, 3);
  assert.equal((tc(revealed) as TaleclueView).rounds.length, 1);
});

test("the clue deadline voids the round over sockets and the next narrator starts", async (t) => {
  const { app, clients, sessions } = await room(t, ["Ana", "Bia", "Cid"]);
  const states = await startTaleclue(clients);
  const first = (tc(states[0]) as TaleclueView).narratorId;
  app.clock.set(app.clock.now() + DEFAULT_TALECLUE_CONFIG.clueSeconds * 1000 + 1);
  await app.hub.runDueTimers();
  const next = await stateWhere(clients[0], (s) => tc(s)?.phase === "clue" && tc(s)?.round === 2);
  assert.ok(next.events.some((e) => e.type === "round-voided" && e.reason === "no-clue"));
  assert.notEqual((tc(next) as TaleclueView).narratorId, first);
  assert.equal((tc(next) as TaleclueView).rounds.length, 0);
  assert.equal(sessions.length, 3);
});

test("a missing decoy is played for the player when the decoy deadline passes", async (t) => {
  const { app, clients, sessions } = await room(t, ["Ana", "Bia", "Cid", "Dan"]);
  const states = await startTaleclue(clients);
  const narrator = sessions.findIndex((s) => s.memberId === tc(states[0])?.narratorId);
  const nView = tc(states[narrator]) as TaleclueView;
  await emit(clients[narrator], "game:action", {
    type: "give-clue",
    cardId: nView.hand[0],
    clue: "uma pista",
  });
  await Promise.all(clients.map((c) => stateWhere(c, (s) => tc(s)?.phase === "decoy")));
  app.clock.set(app.clock.now() + DEFAULT_TALECLUE_CONFIG.decoySeconds * 1000 + 1);
  await app.hub.runDueTimers();
  const vote = await stateWhere(clients[narrator], (s) => tc(s)?.phase === "vote");
  assert.equal(vote.events.filter((e) => e.type === "decoy-played" && e.auto).length, 3);
  assert.equal((tc(vote) as TaleclueView).table.length, 4);
});

test("a member who joins mid-game is a spectator with no hand and cannot act", async (t) => {
  const { app, sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  await startTaleclue(clients);
  const late = await joinRoomVia(app, sessions[0].code, "Dan");
  const lateClient = await connectClient(app.url, late.sessionToken);
  t.after(() => lateClient.close());
  const s = await stateWhere(lateClient, (x) => !!tc(x));
  assert.equal(s.room.members.find((m) => m.id === late.memberId)?.role, "spectator");
  const view = tc(s) as TaleclueView;
  assert.deepEqual(view.hand, []);
  assert.deepEqual(view.myCards, []);
  assert.deepEqual(await emit(lateClient, "game:action", { type: "vote", cardId: "tc-001" }), {
    ok: false,
    error: "not-a-player",
  });
});

test("a player who reconnects gets the same hand back", async (t) => {
  const { app, sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const states = await startTaleclue(clients);
  const hand = (tc(states[1]) as TaleclueView).hand;
  clients[1].close();
  await stateWhere(clients[0], (s) => s.room.members.some((m) => !m.online));
  const again = await connectClient(app.url, sessions[1].sessionToken);
  t.after(() => again.close());
  const s = await stateWhere(again, (x) => !!tc(x));
  assert.deepEqual((tc(s) as TaleclueView).hand, hand);
});

test("reconnecting during the reveal brings the steps and the deadline", async (t) => {
  const { app, sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const states = await startTaleclue(clients);
  await playRound(clients, sessions, states);
  clients[2].close();
  const again = await connectClient(app.url, sessions[2].sessionToken);
  t.after(() => again.close());
  const s = await stateWhere(again, (x) => tc(x)?.phase === "reveal");
  const view = tc(s) as TaleclueView;
  assert.equal(view.rounds.length, 1);
  assert.equal(view.rounds[0].steps.length, 5);
  assert.ok(view.deadline && view.deadline > s.room.serverNow);
});

test("the narrator leaving the room voids the round", async (t) => {
  const { sessions, clients } = await room(t, ["Ana", "Bia", "Cid", "Dan"]);
  const states = await startTaleclue(clients);
  const narrator = sessions.findIndex((s) => s.memberId === tc(states[0])?.narratorId);
  const watcher = clients.findIndex((_, i) => i !== narrator);
  assert.deepEqual(await emit(clients[narrator], "room:leave"), { ok: true });
  const next = await stateWhere(clients[watcher], (s) => tc(s)?.round === 2);
  assert.ok(next.events.some((e) => e.type === "round-voided" && e.reason === "narrator-left"));
  assert.equal((tc(next) as TaleclueView).players.length, 3);
});

test("dropping below 3 players ends the game with not-enough-players", async (t) => {
  const { sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  await startTaleclue(clients);
  assert.deepEqual(await emit(clients[2], "room:leave"), { ok: true });
  const over = await stateWhere(clients[0], (s) => tc(s)?.phase === "game-over");
  const view = tc(over) as TaleclueView;
  assert.equal(view.endReason, "not-enough-players");
  assert.equal(sessions.length, 3);
  assert.ok(view.winners.length >= 1);
});

test("a second game in the room deals none of the cards the first one dealt", async (t) => {
  const { app, sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  await startTaleclue(clients);
  const first = (await app.store.load(sessions[0].code))?.game;
  assert.equal(first?.type, "taleclue");
  const dealt = new Set(first?.type === "taleclue" ? first.state.used : []);
  assert.ok(dealt.size >= 21);
  assert.deepEqual(await emit(clients[0], "game:end"), { ok: true });
  await stateWhere(clients[0], (s) => tc(s)?.phase === "game-over");
  assert.deepEqual(await emit(clients[0], "game:start"), { ok: true });
  const second = await Promise.all(
    clients.map((c) => stateWhere(c, (s) => tc(s)?.phase === "clue")),
  );
  for (const s of second) {
    for (const card of (tc(s) as TaleclueView).hand) assert.equal(dealt.has(card), false, card);
  }
  const saved = await app.store.load(sessions[0].code);
  assert.ok((saved?.lobby.taleclueUsed.length ?? 0) >= dealt.size);
});

test("when the room has seen too many cards the memory resets and the game still starts", async (t) => {
  const { app, sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const saved = await app.store.load(sessions[0].code);
  assert.ok(saved);
  // Leave only 5 unseen cards: 3 players need 27.
  saved.lobby.taleclueUsed = TALECLUE_CARDS.slice(5).map((c) => c.id);
  await app.store.save(saved);
  const states = await startTaleclue(clients);
  assert.equal((tc(states[0]) as TaleclueView).hand.length, 7);
  const after = await app.store.load(sessions[0].code);
  assert.deepEqual(after?.lobby.taleclueUsed, []);
});

test("over the socket nobody sees another hand, authorship or vote before the reveal", async (t) => {
  const { sessions, clients } = await room(t, ["Ana", "Bia", "Cid", "Dan", "Eva"]);
  // Every payload each client receives, in order, recorded from before the game starts.
  const log: RoomStatePayload[][] = clients.map(() => []);
  for (const [i, c] of clients.entries())
    c.on("room:state", (p: RoomStatePayload) => log[i].push(p));
  const config = { ...DEFAULT_TALECLUE_CONFIG, maxPlayers: 4 };
  const states = await startTaleclue(clients, config);
  assert.equal(
    states[4].room.members.find((m) => m.id === sessions[4].memberId)?.role,
    "spectator",
  );
  const initialHands = states.map((s) => new Set((tc(s) as TaleclueView).hand));
  const players = [0, 1, 2, 3];
  await playRound(
    players.map((i) => clients[i]),
    players.map((i) => sessions[i]),
    players.map((i) => states[i]),
  );
  await stateWhere(clients[4], (s) => tc(s)?.phase === "reveal");

  for (const [i, payloads] of log.entries()) {
    const revealAt = payloads.findIndex((p) => tc(p)?.phase === "reveal");
    assert.ok(revealAt > 0, `client ${i} never reached the reveal`);
    for (const p of payloads.slice(0, revealAt)) {
      const view = tc(p);
      if (!view) continue;
      const text = JSON.stringify(view);
      // Authorship and votes only exist inside the reveal steps.
      assert.equal(text.includes("ownerId"), false, `client ${i} saw an owner`);
      assert.equal(text.includes("voterId"), false, `client ${i} saw a voter`);
      // Hand and played cards are the client's own, and a spectator has none.
      for (const card of [...view.hand, ...view.myCards]) {
        assert.equal(initialHands[i].has(card), true, `client ${i} saw foreign card ${card}`);
      }
      if (i === 4) assert.deepEqual([view.hand, view.myCards, view.myVote], [[], [], null]);
      for (const e of p.events) {
        assert.equal(JSON.stringify(e).includes("cardId"), false, `event ${e.type} leaked a card`);
      }
    }
  }
  // After the reveal, the same steps are public to everyone, spectator included.
  const spectatorReveal = log[4].find((p) => tc(p)?.phase === "reveal");
  assert.ok(spectatorReveal);
  assert.equal((tc(spectatorReveal) as TaleclueView).rounds[0].steps.length, 5);
});

test("the room remembers Taleclue cards even when another game starts in between", async (t) => {
  const { app, sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  await startTaleclue(clients);
  const first = (await app.store.load(sessions[0].code))?.game;
  const dealt = first?.type === "taleclue" ? first.state.used : [];
  assert.ok(dealt.length >= 21);
  assert.deepEqual(await emit(clients[0], "game:end"), { ok: true });
  await stateWhere(clients[0], (s) => tc(s)?.phase === "game-over");
  assert.deepEqual(await emit(clients[0], "lobby:select-game", { game: "huehint" }), { ok: true });
  assert.deepEqual(await emit(clients[0], "game:start"), { ok: true });
  const saved = await app.store.load(sessions[0].code);
  assert.equal(saved?.game?.type, "huehint");
  for (const card of dealt) assert.ok(saved?.lobby.taleclueUsed.includes(card), card);
});
