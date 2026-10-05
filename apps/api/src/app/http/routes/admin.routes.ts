import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ServerDependencies } from "../../core/server.js";
import { settings } from "../../core/settings.js";
import { RateLimiter } from "../../domain/room/rate-limiter.js";

const ADMIN_TTL_SECONDS = 3600;
const STATE_TTL_SECONDS = 600;
const adminKey = (token: string) => `admin:${token}`;
const stateKey = (state: string) => `oauth-state:${state}`;
const sha256 = (value: string) => createHash("sha256").update(value).digest();

export async function adminRoutes(
  fastify: FastifyInstance,
  deps: ServerDependencies,
): Promise<void> {
  const { redis, spotifyAuth, now, newId } = deps;
  // ponytail: in-memory per process, like the chat limiter; Redis counters for multiple instances.
  const loginLimiter = new RateLimiter(5, 60_000);
  const webRedirect = (status: "connected" | "error") =>
    `${settings.WEB_URL}/admin/spotify?status=${status}`;

  const isAdmin = async (token: unknown) =>
    typeof token === "string" && token.length > 0 && (await redis.exists(adminKey(token))) === 1;

  const requireBearer = async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization ?? "";
    if (!(await isAdmin(header.startsWith("Bearer ") ? header.slice(7) : null))) {
      return reply.status(401).send({ error: "unauthorized" });
    }
  };

  const notConfigured = (reply: FastifyReply) =>
    reply.status(503).send({ error: "spotify-not-configured" });

  fastify.post("/admin/login", async (request, reply) => {
    if (!loginLimiter.allow(request.ip, now())) {
      return reply.status(429).send({ error: "too-many-attempts" });
    }
    const body = z.object({ password: z.string() }).safeParse(request.body);
    const ok =
      body.success && timingSafeEqual(sha256(body.data.password), sha256(settings.ADMIN_PASSWORD));
    if (!ok) return reply.status(401).send({ error: "invalid-password" });
    const adminToken = newId();
    await redis.set(adminKey(adminToken), "1", "EX", ADMIN_TTL_SECONDS);
    return { adminToken };
  });

  fastify.get("/admin/spotify/status", { preHandler: requireBearer }, async () => ({
    connected: spotifyAuth ? await spotifyAuth.isConnected() : false,
    configured: spotifyAuth !== undefined,
  }));

  fastify.post(
    "/admin/spotify/authorize",
    { preHandler: requireBearer },
    async (_request, reply) => {
      if (!spotifyAuth) return notConfigured(reply);
      const state = newId();
      await redis.set(stateKey(state), "1", "EX", STATE_TTL_SECONDS);
      return { authorizeUrl: spotifyAuth.authorizeUrl(state) };
    },
  );

  fastify.get<{ Querystring: { code?: string; state?: string } }>(
    "/admin/spotify/callback",
    async (request, reply) => {
      if (!spotifyAuth) return notConfigured(reply);
      const { code, state } = request.query;
      // GETDEL: the state is single-use even when the exchange then fails.
      const valid =
        typeof state === "string" && state !== "" && (await redis.getdel(stateKey(state))) !== null;
      if (!valid || typeof code !== "string" || code === "") {
        return reply.redirect(webRedirect("error"), 302);
      }
      try {
        await spotifyAuth.exchangeCode(code);
      } catch (err) {
        request.log.error({ err }, "spotify code exchange failed");
        return reply.redirect(webRedirect("error"), 302);
      }
      return reply.redirect(webRedirect("connected"), 302);
    },
  );

  fastify.post(
    "/admin/spotify/disconnect",
    { preHandler: requireBearer },
    async (_request, reply) => {
      await spotifyAuth?.disconnect();
      return reply.status(204).send();
    },
  );
}
