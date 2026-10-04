import assert from "node:assert/strict";
import { test } from "node:test";
import { startTestServer } from "../../../test/helpers.js";

const ana = { name: "Ana", avatar: { hue: 275, shape: "organic" } };

test("POST /rooms creates a room with the creator as owner", async () => {
  const app = await startTestServer();
  const res = await app.fastify.inject({ method: "POST", url: "/rooms", payload: ana });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.match(body.code, /^[A-HJKMNP-Z]{5}$/);
  const room = await app.store.load(body.code);
  assert.equal(room?.ownerId, body.memberId);
  assert.deepEqual(await app.store.resolveSession(body.sessionToken), {
    code: body.code,
    memberId: body.memberId,
  });
  await app.close();
});

test("POST /rooms rejects an invalid body with 400", async () => {
  const app = await startTestServer();
  const res = await app.fastify.inject({
    method: "POST",
    url: "/rooms",
    payload: { name: "", avatar: ana.avatar },
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test("joining adds the member and issues a session", async () => {
  const app = await startTestServer();
  const created = (
    await app.fastify.inject({ method: "POST", url: "/rooms", payload: ana })
  ).json();
  const res = await app.fastify.inject({
    method: "POST",
    url: `/rooms/${created.code.toLowerCase()}/members`,
    payload: { name: "Bia", avatar: { hue: 12, shape: "cloud" } },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  const room = await app.store.load(created.code);
  assert.deepEqual(
    room?.members.map((m) => m.name),
    ["Ana", "Bia"],
  );
  assert.equal(room?.ownerId, created.memberId);
  assert.deepEqual(await app.store.resolveSession(body.sessionToken), {
    code: created.code,
    memberId: body.memberId,
  });
  await app.close();
});

test("joining with a taken name returns 409 name-taken", async () => {
  const app = await startTestServer();
  const created = (
    await app.fastify.inject({
      method: "POST",
      url: "/rooms",
      payload: { name: "Kaíser", avatar: ana.avatar },
    })
  ).json();
  const res = await app.fastify.inject({
    method: "POST",
    url: `/rooms/${created.code}/members`,
    payload: { name: "kaiser", avatar: ana.avatar },
  });
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.json(), { error: "name-taken" });
  await app.close();
});

test("joining a full room returns 409 room-full", async () => {
  const app = await startTestServer();
  const created = (
    await app.fastify.inject({ method: "POST", url: "/rooms", payload: ana })
  ).json();
  for (let i = 1; i < 20; i++) {
    const res = await app.fastify.inject({
      method: "POST",
      url: `/rooms/${created.code}/members`,
      payload: { name: `P${i}`, avatar: ana.avatar },
    });
    assert.equal(res.statusCode, 201);
  }
  const res = await app.fastify.inject({
    method: "POST",
    url: `/rooms/${created.code}/members`,
    payload: { name: "Late", avatar: ana.avatar },
  });
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.json(), { error: "room-full" });
  await app.close();
});

test("joining an unknown room returns 404 room-not-found", async () => {
  const app = await startTestServer();
  const res = await app.fastify.inject({
    method: "POST",
    url: "/rooms/ZZZZZ/members",
    payload: ana,
  });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: "room-not-found" });
  await app.close();
});

test("GET /rooms/:code returns the code of an existing room", async () => {
  const app = await startTestServer();
  const created = (
    await app.fastify.inject({ method: "POST", url: "/rooms", payload: ana })
  ).json();
  const res = await app.fastify.inject({ method: "GET", url: `/rooms/${created.code}` });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { code: created.code });
  await app.close();
});

test("GET /rooms/:code returns 404 after the room key expires", async () => {
  const app = await startTestServer();
  const created = (
    await app.fastify.inject({ method: "POST", url: "/rooms", payload: ana })
  ).json();
  await app.store.redis.del(`room:${created.code}`);
  const res = await app.fastify.inject({ method: "GET", url: `/rooms/${created.code}` });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: "room-not-found" });
  await app.close();
});

test("room key carries a 6 hour TTL", async () => {
  const app = await startTestServer();
  const created = (
    await app.fastify.inject({ method: "POST", url: "/rooms", payload: ana })
  ).json();
  const ttl = await app.store.redis.ttl(`room:${created.code}`);
  assert.ok(ttl >= 21590 && ttl <= 21600, `ttl was ${ttl}`);
  await app.close();
});

test("GET /health reports redis status", async () => {
  const app = await startTestServer();
  const res = await app.fastify.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "ok", redis: "ok" });
  await app.close();
});
