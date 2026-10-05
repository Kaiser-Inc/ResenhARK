import { newId } from "./app/core/ids.js";
import { createRedis } from "./app/core/redis.js";
import { seededRng } from "./app/core/seeded-rng.js";
import { createServer } from "./app/core/server.js";
import { settings } from "./app/core/settings.js";
import { ChainedPreview } from "./app/gateways/audio/chained-preview.js";
import { DeezerPreview } from "./app/gateways/audio/deezer-preview.js";
import { createFetchAudio } from "./app/gateways/audio/fetch-audio.js";
import { FixturePreview } from "./app/gateways/audio/fixture-preview.js";
import { ItunesPreview } from "./app/gateways/audio/itunes-preview.js";
import { FixturePlaylistSource } from "./app/gateways/fixture/fixture-playlist-source.js";
import { SpotifyAuth } from "./app/gateways/spotify/spotify-auth.js";
import { SpotifyPlaylistSource } from "./app/gateways/spotify/spotify-playlist-source.js";
import { RedisRoomStore } from "./app/repositories/redis-room-store.js";
import { RedisSpotifyTokenStore } from "./app/repositories/redis-spotify-token-store.js";

async function bootstrap(): Promise<void> {
  const redis = createRedis(settings.REDIS_URL);
  const spotifyAuth =
    settings.SPOTIFY_CLIENT_ID && settings.SPOTIFY_CLIENT_SECRET && settings.SPOTIFY_REDIRECT_URI
      ? new SpotifyAuth({
          clientId: settings.SPOTIFY_CLIENT_ID,
          clientSecret: settings.SPOTIFY_CLIENT_SECRET,
          redirectUri: settings.SPOTIFY_REDIRECT_URI,
          store: new RedisSpotifyTokenStore(redis),
          now: () => Date.now(),
        })
      : undefined;
  const { fastify, hub } = await createServer({
    spotifyAuth,
    store: new RedisRoomStore(redis),
    redis,
    now: () => Date.now(),
    rng: settings.E2E_SEED === undefined ? Math.random : seededRng(settings.E2E_SEED),
    newId,
    audio:
      settings.AUDIO_SOURCE === "fixture"
        ? new FixturePreview()
        : new ChainedPreview([new DeezerPreview(), new ItunesPreview()]),
    fetchAudio: createFetchAudio(),
    playlists:
      settings.PLAYLIST_SOURCE === "fixture"
        ? new FixturePlaylistSource(newId)
        : spotifyAuth
          ? new SpotifyPlaylistSource({ auth: spotifyAuth, newId })
          : { load: async () => ({ ok: false, error: "spotify-disconnected" }) },
  });

  try {
    await hub.rehydrate();
    await fastify.listen({ port: settings.PORT, host: "0.0.0.0" });
    console.log(`API running on port ${settings.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    redis.disconnect();
    process.exit(1);
  }
}

bootstrap();
