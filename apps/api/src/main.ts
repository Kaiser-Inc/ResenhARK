import { newId } from "./app/core/ids.js";
import { createRedis } from "./app/core/redis.js";
import { createServer } from "./app/core/server.js";
import { settings } from "./app/core/settings.js";
import { RedisRoomStore } from "./app/repositories/redis-room-store.js";

async function bootstrap(): Promise<void> {
  const redis = createRedis(settings.REDIS_URL);
  const { fastify } = await createServer({
    store: new RedisRoomStore(redis),
    redis,
    now: () => Date.now(),
    rng: Math.random,
    newId,
  });

  try {
    await fastify.listen({ port: settings.PORT, host: "0.0.0.0" });
    console.log(`API running on port ${settings.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    redis.disconnect();
    process.exit(1);
  }
}

bootstrap();
