import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ack, ChatMessage } from "@resenhark/shared";
import type { Socket } from "socket.io-client";
import {
  connectClient,
  createRoomVia,
  joinRoomVia,
  nextChatHistory,
  nextChatMessage,
  nextState,
  startTestServer,
} from "../../test/helpers.js";
import { systemMessage } from "../domain/room/chat.js";

// Joins are announced as system messages; these tests care about user messages only.
const userMessages = (messages: ChatMessage[]) => messages.filter((m) => m.kind === "user");

async function nextUserMessage(socket: Socket): Promise<ChatMessage> {
  for (;;) {
    const message = await nextChatMessage(socket);
    if (message.kind === "user") return message;
  }
}

const send = (socket: Socket, text: unknown): Promise<Ack> =>
  socket.timeout(2000).emitWithAck("chat:send", { text });

test("a message reaches every member and new joiners get the history", async (t) => {
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
  assert.deepEqual(userMessages(await nextChatHistory(anaClient)), []);

  assert.deepEqual(await send(anaClient, "oi"), { ok: true });
  const received = await nextUserMessage(biaClient);
  assert.equal(received.kind, "user");
  assert.equal(received.text, "oi");
  assert.equal(received.kind === "user" && received.name, "Ana");
  assert.equal(received.kind === "user" && received.memberId, ana.memberId);
  assert.equal(received.at, app.clock.now());
  assert.deepEqual(await nextUserMessage(anaClient), received);

  const caio = await joinRoomVia(app, ana.code, "Caio");
  const caioClient = await connectClient(app.url, caio.sessionToken);
  t.after(() => caioClient.close());
  assert.deepEqual(userMessages(await nextChatHistory(caioClient)), [received]);
});

test("history keeps only the last 200 messages", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  for (let i = 1; i <= 205; i++) {
    await app.store.appendChat("ABCDE", systemMessage(`m${i}`, `id-${i}`, i));
  }
  const history = await app.store.chatHistory("ABCDE");
  assert.equal(history.length, 200);
  assert.equal(history[0].text, "m6");
  assert.equal(history[199].text, "m205");
});

test("the 6th message in 5 seconds is rejected with rate-limited", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const client = await connectClient(app.url, ana.sessionToken);
  t.after(() => client.close());
  await nextState(client);
  for (let i = 1; i <= 5; i++) assert.deepEqual(await send(client, `m${i}`), { ok: true });
  assert.deepEqual(await send(client, "m6"), { ok: false, error: "rate-limited" });
  app.clock.set(app.clock.now() + 5001);
  assert.deepEqual(await send(client, "m7"), { ok: true });
});

test("html is stored as plain text", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const client = await connectClient(app.url, ana.sessionToken);
  t.after(() => client.close());
  await nextState(client);
  await send(client, "<script>x</script>");
  assert.equal((await nextUserMessage(client)).text, "<script>x</script>");
});

test("invalid messages are rejected and not stored", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const client = await connectClient(app.url, ana.sessionToken);
  t.after(() => client.close());
  await nextState(client);
  for (const bad of ["", "   ", "a".repeat(501), 42]) {
    assert.deepEqual(await send(client, bad), { ok: false, error: "invalid-message" });
  }
  assert.deepEqual(userMessages(await app.store.chatHistory(ana.code)), []);
});

test("a removed member cannot send", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const client = await connectClient(app.url, ana.sessionToken);
  t.after(() => client.close());
  await nextState(client);
  const room = await app.store.load(ana.code);
  assert.ok(room);
  await app.store.save({ ...room, members: [] });
  assert.deepEqual(await send(client, "oi"), { ok: false, error: "invalid-session" });
  assert.deepEqual(userMessages(await app.store.chatHistory(ana.code)), []);
});

test("a successful send renews the room and session TTLs", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const client = await connectClient(app.url, ana.sessionToken);
  t.after(() => client.close());
  await nextState(client);
  const { redis } = app.store;
  const keys = [`room:${ana.code}`, `session:${ana.sessionToken}`];
  for (const key of keys) await redis.expire(key, 100);
  assert.deepEqual(await send(client, "oi"), { ok: true });
  for (const key of keys) assert.ok((await redis.ttl(key)) > 21000, `${key} ttl not renewed`);
});

test("an unexpected failure acks server-error, not invalid-session", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const client = await connectClient(app.url, ana.sessionToken);
  t.after(() => client.close());
  await nextState(client);
  app.store.appendChat = async () => {
    throw new Error("redis down");
  };
  assert.deepEqual(await send(client, "oi"), { ok: false, error: "server-error" });
});
