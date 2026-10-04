import assert from "node:assert/strict";
import { test } from "node:test";
import type { Server } from "socket.io";
import { createRoomVia, startTestServer } from "../../test/helpers.js";
import { RoomHub } from "./room-hub.js";

const failingIo = {
  in: () => ({
    fetchSockets: async () => {
      throw new Error("broadcast down");
    },
  }),
} as unknown as Server;

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const app = await startTestServer();
  t.after(() => app.close());
  const { code } = await createRoomVia(app, "Ana");
  const errors: unknown[] = [];
  const deps = {
    store: app.store,
    io: app.io,
    now: app.clock.now,
    rng: Math.random,
    newId: () => "x",
  };
  return { app, code, errors, deps, onError: (err: unknown) => errors.push(err) };
}

const rename = (name: string) => (room: import("../domain/room/room.js").Room) => ({
  ok: true as const,
  room: { ...room, members: room.members.map((m) => ({ ...m, name })) },
});

test("a broadcast failure after save still reports success and is logged", async (t) => {
  const { app, code, errors, deps, onError } = await setup(t);
  const hub = new RoomHub({ ...deps, io: failingIo, onError });
  assert.deepEqual(await hub.mutate(code, rename("Renamed")), { ok: true });
  assert.equal((await app.store.load(code))?.members[0].name, "Renamed");
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /broadcast down/);
});

test("a touch failure after save still reports success and is logged", async (t) => {
  const { app, code, errors, deps, onError } = await setup(t);
  const store = Object.create(app.store, {
    touch: {
      value: async () => {
        throw new Error("touch down");
      },
    },
  });
  const hub = new RoomHub({ ...deps, store, onError });
  assert.deepEqual(await hub.mutate(code, rename("Renamed")), { ok: true });
  assert.equal((await app.store.load(code))?.members[0].name, "Renamed");
  assert.match(String(errors[0]), /touch down/);
});

test("a failure before save rejects and leaves the queue usable", async (t) => {
  const { code, deps } = await setup(t);
  const hub = new RoomHub(deps);
  await assert.rejects(
    hub.mutate(code, () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.deepEqual(await hub.mutate(code, rename("Next")), { ok: true });
});
