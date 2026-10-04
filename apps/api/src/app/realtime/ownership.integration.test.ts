import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ack, ChatMessage } from "@resenhark/shared";
import type { Socket } from "socket.io-client";
import {
  connectClient,
  createRoomVia,
  joinRoomVia,
  nextChatMessage,
  nextState,
  startTestServer,
  stateWhere,
} from "../../test/helpers.js";

const emit = (socket: Socket, event: string, payload?: unknown): Promise<Ack> =>
  socket.timeout(2000).emitWithAck(event, payload);

/** Consumes chat messages until one has this text. */
async function systemText(socket: Socket, text: string): Promise<ChatMessage> {
  for (let i = 0; i < 20; i++) {
    const message = await nextChatMessage(socket);
    if (message.text === text) return message;
  }
  throw new Error(`no chat message "${text}"`);
}

const closed = (socket: Socket) =>
  new Promise<void>((resolve) =>
    socket.connected ? socket.once("disconnect", () => resolve()) : resolve(),
  );

test("owner offline for 60s hands the room to Bia and announces it", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const bia = await joinRoomVia(app, ana.code, "Bia");
  const anaClient = await connectClient(app.url, ana.sessionToken);
  const biaClient = await connectClient(app.url, bia.sessionToken);
  t.after(() => {
    anaClient.close();
    biaClient.close();
  });
  await stateWhere(biaClient, (s) => s.room.members.every((m) => m.online));

  anaClient.close();
  const offline = await stateWhere(
    biaClient,
    (s) => s.room.members.find((m) => m.id === ana.memberId)?.online === false,
  );
  assert.equal(offline.room.ownerId, ana.memberId);

  app.clock.set(app.clock.now() + 60_000);
  await app.hub.runDueTimers();
  const state = await stateWhere(biaClient, (s) => s.room.ownerId === bia.memberId);
  assert.equal(state.room.members.find((m) => m.id === bia.memberId)?.isOwner, true);
  const message = await systemText(biaClient, "Bia agora é o dono da sala");
  assert.equal(message.kind, "system");
});

test("owner offline for 59s keeps the room", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const bia = await joinRoomVia(app, ana.code, "Bia");
  const anaClient = await connectClient(app.url, ana.sessionToken);
  const biaClient = await connectClient(app.url, bia.sessionToken);
  t.after(() => {
    anaClient.close();
    biaClient.close();
  });
  await stateWhere(biaClient, (s) => s.room.members.every((m) => m.online));
  anaClient.close();
  await stateWhere(
    biaClient,
    (s) => s.room.members.find((m) => m.id === ana.memberId)?.online === false,
  );

  app.clock.set(app.clock.now() + 59_999);
  await app.hub.runDueTimers();
  assert.equal((await app.store.load(ana.code))?.ownerId, ana.memberId);
});

test("the owner kicks Bia: she gets room:kicked, drops, and her token is rejected", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const bia = await joinRoomVia(app, ana.code, "Bia");
  const anaClient = await connectClient(app.url, ana.sessionToken);
  const biaClient = await connectClient(app.url, bia.sessionToken);
  t.after(() => {
    anaClient.close();
    biaClient.close();
  });
  await stateWhere(anaClient, (s) => s.room.members.every((m) => m.online));
  const kicked = new Promise<void>((resolve) => biaClient.once("room:kicked", () => resolve()));
  const dropped = closed(biaClient);

  assert.deepEqual(await emit(anaClient, "room:kick", { targetId: bia.memberId }), { ok: true });
  await kicked;
  await dropped;
  await assert.rejects(connectClient(app.url, bia.sessionToken), /invalid-session/);
  const state = await stateWhere(anaClient, (s) => s.room.members.length === 1);
  assert.equal(state.room.members[0].id, ana.memberId);
  await systemText(anaClient, "Bia foi removido da sala");
});

test("kick validates the actor and the target", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const bia = await joinRoomVia(app, ana.code, "Bia");
  const anaClient = await connectClient(app.url, ana.sessionToken);
  const biaClient = await connectClient(app.url, bia.sessionToken);
  t.after(() => {
    anaClient.close();
    biaClient.close();
  });
  await nextState(anaClient);
  await nextState(biaClient);
  assert.deepEqual(await emit(biaClient, "room:kick", { targetId: ana.memberId }), {
    ok: false,
    error: "not-owner",
  });
  assert.deepEqual(await emit(anaClient, "room:kick", { targetId: ana.memberId }), {
    ok: false,
    error: "invalid-target",
  });
  assert.deepEqual(await emit(anaClient, "room:kick", { targetId: 42 }), {
    ok: false,
    error: "invalid-input",
  });
});

test("the owner leaving passes the room to the next online member and announces both", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const bia = await joinRoomVia(app, ana.code, "Bia");
  const caio = await joinRoomVia(app, ana.code, "Caio");
  const anaClient = await connectClient(app.url, ana.sessionToken);
  const caioClient = await connectClient(app.url, caio.sessionToken);
  t.after(() => {
    anaClient.close();
    caioClient.close();
  });
  await stateWhere(caioClient, (s) => s.room.members.filter((m) => m.online).length === 2);
  const dropped = closed(anaClient);

  assert.deepEqual(await emit(anaClient, "room:leave"), { ok: true });
  await dropped;
  const state = await stateWhere(caioClient, (s) => s.room.members.length === 2);
  assert.equal(state.room.ownerId, caio.memberId);
  await systemText(caioClient, "Ana saiu");
  await systemText(caioClient, "Caio agora é o dono da sala");
  await assert.rejects(connectClient(app.url, ana.sessionToken), /invalid-session/);
  assert.ok(bia);
});

test("'entrou' is announced on the first connection only, not on reconnects", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const first = await connectClient(app.url, ana.sessionToken);
  await nextState(first);
  first.close();
  const second = await connectClient(app.url, ana.sessionToken);
  t.after(() => second.close());
  await nextState(second);
  const history = await app.store.chatHistory(ana.code);
  assert.deepEqual(
    history.map((m) => m.text),
    ["Ana entrou"],
  );
});
