import { readFile } from "node:fs/promises";
import { newId } from "./app/core/ids.js";
import { createRedis } from "./app/core/redis.js";
import { createServer } from "./app/core/server.js";
import { settings } from "./app/core/settings.js";
import { ChainedPreview } from "./app/gateways/audio/chained-preview.js";
import { DeezerPreview } from "./app/gateways/audio/deezer-preview.js";
import { FIXTURE_AUDIO_URL, FixturePreview } from "./app/gateways/audio/fixture-preview.js";
import { ItunesPreview } from "./app/gateways/audio/itunes-preview.js";
import { RedisRoomStore } from "./app/repositories/redis-room-store.js";

const silenceUrl = new URL("./test/silence.mp3", import.meta.url);

async function fetchAudio(url: string): Promise<Response> {
  if (url === FIXTURE_AUDIO_URL) {
    return new Response(await readFile(silenceUrl), { headers: { "content-type": "audio/mpeg" } });
  }
  return fetch(url);
}

async function bootstrap(): Promise<void> {
  const redis = createRedis(settings.REDIS_URL);
  const { fastify } = await createServer({
    store: new RedisRoomStore(redis),
    redis,
    now: () => Date.now(),
    rng: Math.random,
    newId,
    audio:
      settings.AUDIO_SOURCE === "fixture"
        ? new FixturePreview()
        : new ChainedPreview([new DeezerPreview(), new ItunesPreview()]),
    fetchAudio,
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
