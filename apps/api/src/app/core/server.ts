import fastifyCors from "@fastify/cors";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Redis } from "ioredis";
import { Server } from "socket.io";
import type { AudioPreviewSource } from "../gateways/ports/audio-preview-source.js";
import type { PlaylistSource } from "../gateways/ports/playlist-source.js";
import type { SpotifyAuth } from "../gateways/spotify/spotify-auth.js";
import { adminRoutes } from "../http/routes/admin.routes.js";
import { audioRoutes } from "../http/routes/audio.routes.js";
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
  audio: AudioPreviewSource;
  playlists: PlaylistSource;
  /** Absent when the SPOTIFY_* settings are missing. */
  spotifyAuth?: SpotifyAuth;
  /** Fetches the bytes behind a provider preview URL. */
  fetchAudio: (url: string) => Promise<Response>;
  /** Defaults to on outside of NODE_ENV=test. */
  logger?: boolean;
  /** Proxies in front of the API whose X-Forwarded-For is trusted. Defaults to TRUST_PROXY_HOPS. */
  trustProxyHops?: number;
}

export async function createServer(
  deps: ServerDependencies,
): Promise<{ fastify: FastifyInstance; io: Server; hub: RoomHub }> {
  const logging = deps.logger ?? settings.NODE_ENV !== "test";
  const hops = deps.trustProxyHops ?? settings.TRUST_PROXY_HOPS;
  const fastify = Fastify({
    logger: logging ? { redact: ["req.headers.authorization"] } : false,
    // A trust function, not the number form: counts hops from the socket and ignores spoofed leading entries.
    trustProxy: hops > 0 ? (_addr: string, hop: number) => hop < hops : false,
  });

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(fastifyCors, corsOptions);

  const io = new Server(fastify.server, { cors: { origin: settings.CORS_ORIGIN } });
  const onError = (err: unknown) => fastify.log.error(err);
  const hub = new RoomHub({ ...deps, io, onError });
  fastify.addHook("onClose", async () => hub.dispose());
  registerSocketGateway(io, {
    store: deps.store,
    hub,
    playlists: deps.playlists,
    now: deps.now,
    rng: deps.rng,
    newId: deps.newId,
    onError,
  });

  await healthRoutes(fastify, deps);
  await roomRoutes(fastify, deps, hub);
  await audioRoutes(fastify, deps);
  await adminRoutes(fastify, deps);

  fastify.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    fastify.log.error(error);
    return reply.status(500).send({ error: "Internal server error" });
  });

  return { fastify, io, hub };
}
