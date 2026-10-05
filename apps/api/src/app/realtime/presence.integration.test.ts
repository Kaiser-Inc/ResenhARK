import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectClient,
  createRoomVia,
  joinRoomVia,
  nextState,
  startTestServer,
  stateWhere,
} from "../../test/helpers.js";

async function waitFor(check: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("a valid session token connects and receives the room state with the member online", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const { code, sessionToken, memberId } = await createRoomVia(app, "Ana");
  const client = await connectClient(app.url, sessionToken);
  t.after(() => client.close());
  const state = await nextState(client);
  assert.equal(state.room.code, code);
  assert.equal(state.room.you, memberId);
  assert.equal(state.room.members[0].online, true);
  assert.equal(state.room.members[0].isOwner, true);
  assert.equal(state.room.members[0].role, "member");
  assert.equal(state.room.serverNow, app.clock.now());
  assert.deepEqual(state.events, []);
});

test("an unknown token is rejected with invalid-session", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  await assert.rejects(connectClient(app.url, "nope"), /invalid-session/);
});

test("reconnecting with the same token returns the same member", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const { sessionToken, memberId } = await createRoomVia(app, "Ana");
  const first = await connectClient(app.url, sessionToken);
  t.after(() => first.close());
  await nextState(first);
  first.close();
  const second = await connectClient(app.url, sessionToken);
  t.after(() => second.close());
  const state = await nextState(second);
  assert.equal(state.room.you, memberId);
  assert.equal(state.room.members.length, 1);
});

test("member stays online until the last of two tabs disconnects", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const bia = await joinRoomVia(app, ana.code, "Bia");
  const watcher = await connectClient(app.url, ana.sessionToken);
  t.after(() => watcher.close());
  const tab1 = await connectClient(app.url, bia.sessionToken);
  t.after(() => tab1.close());
  const tab2 = await connectClient(app.url, bia.sessionToken);
  t.after(() => tab2.close());
  await waitFor(async () => {
    const room = await app.store.load(ana.code);
    return room?.members.find((m) => m.id === bia.memberId)?.connections === 2;
  });

  // Skip the watcher's states from before Bia connected (she was offline in those).
  await stateWhere(
    watcher,
    (s) => s.room.members.find((m) => m.id === bia.memberId)?.online === true,
  );

  tab1.close();
  await waitFor(async () => {
    const room = await app.store.load(ana.code);
    return room?.members.find((m) => m.id === bia.memberId)?.connections === 1;
  });
  const afterOne = await app.store.load(ana.code);
  assert.equal(afterOne?.members.find((m) => m.id === bia.memberId)?.offlineSince, null);

  app.clock.set(app.clock.now() + 5_000);
  tab2.close();
  const state = await stateWhere(
    watcher,
    (s) => s.room.members.find((m) => m.id === bia.memberId)?.online === false,
  );
  assert.ok(state);
  const afterTwo = await app.store.load(ana.code);
  assert.equal(afterTwo?.members.find((m) => m.id === bia.memberId)?.offlineSince, app.clock.now());
});

test("a connected member sees a new member who joins over HTTP", async (t) => {
  const app = await startTestServer();
  t.after(() => app.close());
  const ana = await createRoomVia(app, "Ana");
  const client = await connectClient(app.url, ana.sessionToken);
  t.after(() => client.close());
  await nextState(client);
  const pending = stateWhere(client, (s) => s.room.members.length === 2);
  await joinRoomVia(app, ana.code, "Bia");
  const state = await pending;
  assert.deepEqual(
    state.room.members.map((m) => [m.name, m.online]),
    [
      ["Ana", true],
      ["Bia", false],
    ],
  );
});
