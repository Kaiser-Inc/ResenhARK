import type { FastifyInstance } from "fastify";
import type { ServerDependencies } from "../../core/server.js";

export async function healthRoutes(
  fastify: FastifyInstance,
  deps: ServerDependencies,
): Promise<void> {
  fastify.get("/health", async () => {
    const redis = await deps.redis.ping().then(
      () => "ok" as const,
      () => "down" as const,
    );
    return { status: "ok", redis };
  });
}
