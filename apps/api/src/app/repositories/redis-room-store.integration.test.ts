import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_HITLINE_CONFIG,
  DEFAULT_HUEHINT_CONFIG,
  DEFAULT_TALECLUE_CONFIG,
} from "@resenhark/shared";
import { startTestServer } from "../../test/helpers.js";

test("revokeMemberSessions drops every session of that member only", async () => {
  const app = await startTestServer();
  const { store } = app;
  await store.createSession("t1", "ABCDE", "m1");
  await store.createSession("t2", "ABCDE", "m1");
  await store.createSession("t3", "ABCDE", "m2");
  await store.revokeMemberSessions("ABCDE", "m1");
  assert.equal(await store.resolveSession("t1"), null);
  assert.equal(await store.resolveSession("t2"), null);
  assert.deepEqual(await store.resolveSession("t3"), { code: "ABCDE", memberId: "m2" });
  await app.close();
});

test("revokeSession drops one session", async () => {
  const app = await startTestServer();
  const { store } = app;
  await store.createSession("t1", "ABCDE", "m1");
  await store.createSession("t2", "ABCDE", "m1");
  await store.revokeSession("t1");
  assert.equal(await store.resolveSession("t1"), null);
  assert.deepEqual(await store.resolveSession("t2"), { code: "ABCDE", memberId: "m1" });
  await app.close();
});

test("touch renews the TTL of the room, chat and sessions", async () => {
  const app = await startTestServer();
  const {
    store,
    store: { redis },
  } = app;
  await redis.set("room:ABCDE", "{}", "EX", 100);
  await redis.rpush("chat:ABCDE", "x");
  await redis.expire("chat:ABCDE", 100);
  await store.createSession("t1", "ABCDE", "m1");
  await redis.expire("session:t1", 100);
  await redis.expire("member-sessions:ABCDE:m1", 100);
  await store.touch("ABCDE");
  for (const key of ["room:ABCDE", "chat:ABCDE", "session:t1", "member-sessions:ABCDE:m1"]) {
    assert.ok((await redis.ttl(key)) > 21000, `${key} ttl not renewed`);
  }
  await app.close();
});

test("load gives rooms saved before Huehint the default game choice", async () => {
  const app = await startTestServer();
  const legacy = {
    code: "ABCDE",
    ownerId: "m1",
    members: [],
    lastActivityAt: 0,
    lobby: { config: DEFAULT_HITLINE_CONFIG, deck: null, played: [] },
    game: null,
  };
  await app.store.redis.set("room:ABCDE", JSON.stringify(legacy));
  const room = await app.store.load("ABCDE");
  assert.equal(room?.lobby.game, "hitline");
  assert.deepEqual(room?.lobby.huehintConfig, DEFAULT_HUEHINT_CONFIG);
  assert.deepEqual(room?.lobby.taleclueConfig, DEFAULT_TALECLUE_CONFIG);
  assert.deepEqual(room?.lobby.taleclueUsed, []);
  await app.close();
});
