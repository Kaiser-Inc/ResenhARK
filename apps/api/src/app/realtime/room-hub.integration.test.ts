import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HITLINE_CONFIG } from "@resenhark/shared";
import type { Server } from "socket.io";
import { createRoomVia, startTestServer } from "../../test/helpers.js";
import { create } from "../games/hitline/engine.js";
import { deckOf, fixedCtx } from "../games/hitline/test-deck.js";
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
    audio: { findPreviewUrl: async () => null },
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

test("a touch failure does not skip the broadcast", async (t) => {
  const { code, errors, deps, onError } = await setup(t);
  const store = Object.create(deps.store, {
    touch: {
      value: async () => {
        throw new Error("touch down");
      },
    },
  });
  let broadcasts = 0;
  const io = {
    in: () => ({
      fetchSockets: async () => {
        broadcasts += 1;
        return [];
      },
    }),
  } as unknown as Server;
  const hub = new RoomHub({ ...deps, store, io, onError });
  assert.deepEqual(await hub.mutate(code, rename("Renamed")), { ok: true });
  assert.equal(broadcasts, 1);
  assert.match(String(errors[0]), /touch down/);
});

test("an all-offline game room is left alone by timers so it can expire", async (t) => {
  const { app, code, deps } = await setup(t);
  const hub = new RoomHub(deps);
  t.after(() => hub.dispose());
  const room = (await app.store.load(code)) as NonNullable<
    Awaited<ReturnType<typeof app.store.load>>
  >;
  const { state } = create(DEFAULT_HITLINE_CONFIG, [room.ownerId, "p2"], deckOf(20), fixedCtx());
  for (const p of state.players) p.online = false;
  const seeded = {
    ...room,
    game: { type: "hitline" as const, state, playerIds: [room.ownerId, "p2"] },
  };
  await app.store.save(seeded);
  assert.deepEqual(await hub.mutate(code, (r) => ({ ok: true as const, room: r })), { ok: true });
  assert.equal(hub.pendingTimers(), 0);
  app.clock.set(app.clock.now() + 10 * 60 * 60 * 1000);
  await hub.runDueTimers();
  assert.deepEqual((await app.store.load(code))?.game?.state, state);
});
