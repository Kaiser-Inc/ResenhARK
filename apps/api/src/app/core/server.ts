import fastifyCors from "@fastify/cors";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Redis } from "ioredis";
import { Server } from "socket.io";
import { healthRoutes } from "../http/routes/health.routes.js";
import { roomRoutes } from "../http/routes/rooms.routes.js";
import { RoomHub } from "../realtime/room-hub.js";
import { registerSocketGateway } from "../realtime/socket-gateway.js";
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
): Promise<{ fastify: FastifyInstance; io: Server; hub: RoomHub }> {
  const fastify = Fastify({ logger: deps.logger ?? settings.NODE_ENV !== "test" });

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(fastifyCors, corsOptions);

  const io = new Server(fastify.server, { cors: { origin: settings.CORS_ORIGIN } });
  const onError = (err: unknown) => fastify.log.error(err);
  const hub = new RoomHub({ ...deps, io, onError });
  fastify.addHook("onClose", async () => hub.dispose());
  registerSocketGateway(io, { store: deps.store, hub, now: deps.now, newId: deps.newId, onError });

  await healthRoutes(fastify, deps);
  await roomRoutes(fastify, deps, hub);

  fastify.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    fastify.log.error(error);
    return reply.status(500).send({ error: "Internal server error" });
  });

  return { fastify, io, hub };
}
