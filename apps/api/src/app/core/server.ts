import fastifyCors from "@fastify/cors";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Redis } from "ioredis";
import { Server } from "socket.io";
import { healthRoutes } from "../http/routes/health.routes.js";
import { roomRoutes } from "../http/routes/rooms.routes.js";
import type { RoomStore } from "../repositories/room-store.js";
import { corsOptions } from "./cors.js";
import { settings } from "./settings.js";

export interface ServerDependencies {
  store: RoomStore;
  redis: Redis;
  now: () => number;
  rng: () => number;
  newId: () => string;
  /** Defaults to on outside of NODE_ENV=test. */
  logger?: boolean;
}

export async function createServer(
  deps: ServerDependencies,
): Promise<{ fastify: FastifyInstance; io: Server }> {
  const fastify = Fastify({ logger: deps.logger ?? settings.NODE_ENV !== "test" });

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(fastifyCors, corsOptions);

  await healthRoutes(fastify, deps);
  await roomRoutes(fastify, deps);

  fastify.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    fastify.log.error(error);
    return reply.status(500).send({ error: "Internal server error" });
  });

  // Handlers are attached in the realtime task.
  const io = new Server(fastify.server, { cors: { origin: settings.CORS_ORIGIN } });

  return { fastify, io };
}
