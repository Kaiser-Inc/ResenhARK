import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { type RoomStatePayload, SOCKET_EVENTS } from "@resenhark/shared";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import type { Server } from "socket.io";
import { type Socket, io as connect } from "socket.io-client";
import { createServer } from "../app/core/server.js";
import { RedisRoomStore } from "../app/repositories/redis-room-store.js";

export const TEST_REDIS_URL = "redis://localhost:6379/15";

export type TestServer = {
  fastify: FastifyInstance;
  io: Server;
  store: RedisRoomStore;
  clock: { now: () => number; set: (ms: number) => void };
  url: string;
  close: () => Promise<void>;
};

// Deterministic LCG so generated room codes are reproducible and still distinct.
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

export async function startTestServer(): Promise<TestServer> {
  const redis = new Redis(TEST_REDIS_URL);
  await redis.flushdb();
  const store = new RedisRoomStore(redis);

  let current = 1_000_000;
  const clock = {
    now: () => current,
    set: (ms: number) => {
      current = ms;
    },
  };
  let counter = 0;

  const { fastify, io } = await createServer({
    store,
    redis,
    now: clock.now,
    rng: seededRng(42),
    newId: () => `id-${++counter}`,
    logger: false,
  });
  await fastify.listen({ port: 0, host: "127.0.0.1" });
  const { port } = fastify.server.address() as AddressInfo;

  return {
    fastify,
    io,
    store,
    clock,
    url: `http://127.0.0.1:${port}`,
    // io.close() also closes the shared http server, so fastify.close() only runs its hooks.
    close: async () => {
      await io.close();
      await fastify.close();
      redis.disconnect();
    },
  };
}

const defaultAvatar = { hue: 275, shape: "organic" } as const;

export type TestSession = { code: string; memberId: string; sessionToken: string };

export async function createRoomVia(app: TestServer, name: string): Promise<TestSession> {
  const res = await app.fastify.inject({
    method: "POST",
    url: "/rooms",
    payload: { name, avatar: defaultAvatar },
  });
  assert.equal(res.statusCode, 201);
  return res.json();
}

export async function joinRoomVia(
  app: TestServer,
  code: string,
  name: string,
): Promise<TestSession> {
  const res = await app.fastify.inject({
    method: "POST",
    url: `/rooms/${code}/members`,
    payload: { name, avatar: defaultAvatar },
  });
  assert.equal(res.statusCode, 201);
  return { code, ...res.json() };
}

// room:state events seen per client, recorded from socket creation so none is missed.
const stateBuffers = new WeakMap<Socket, RoomStatePayload[]>();

/** Resolves once connected; rejects with the server's connect_error. */
export function connectClient(url: string, sessionToken: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(url, {
      auth: { sessionToken },
      transports: ["websocket"],
      reconnection: false,
    });
    const buffer: RoomStatePayload[] = [];
    stateBuffers.set(socket, buffer);
    socket.on(SOCKET_EVENTS.state, (state: RoomStatePayload) => buffer.push(state));
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => {
      socket.close();
      reject(err);
    });
  });
}

/**
 * Resolves with the first `room:state` that satisfies the predicate, consuming events
 * received since the previous call (or since connecting) before waiting for new ones.
 */
export function stateWhere(
  socket: Socket,
  predicate: (state: RoomStatePayload) => boolean,
  timeoutMs = 2000,
): Promise<RoomStatePayload> {
  const buffer = stateBuffers.get(socket);
  if (!buffer) throw new Error("socket was not created by connectClient");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(SOCKET_EVENTS.state, check);
      reject(new Error(`no matching ${SOCKET_EVENTS.state} within ${timeoutMs}ms`));
    }, timeoutMs);
    // Registered after connectClient's recorder, so the buffer is already up to date here.
    function check() {
      while (buffer?.length) {
        const state = buffer.shift() as RoomStatePayload;
        if (!predicate(state)) continue;
        clearTimeout(timer);
        socket.off(SOCKET_EVENTS.state, check);
        resolve(state);
        return;
      }
    }
    socket.on(SOCKET_EVENTS.state, check);
    check();
  });
}

export function nextState(socket: Socket, timeoutMs = 2000): Promise<RoomStatePayload> {
  return stateWhere(socket, () => true, timeoutMs);
}
