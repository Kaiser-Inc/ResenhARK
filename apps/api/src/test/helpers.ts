import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import type { Server } from "socket.io";
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
