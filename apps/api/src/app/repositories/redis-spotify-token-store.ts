import type { Redis } from "ioredis";
import type { SpotifyTokenStore } from "../gateways/spotify/spotify-auth.js";

const KEY = "spotify:refresh";

export class RedisSpotifyTokenStore implements SpotifyTokenStore {
  constructor(private readonly redis: Redis) {}

  getRefreshToken(): Promise<string | null> {
    return this.redis.get(KEY);
  }

  async setRefreshToken(token: string | null): Promise<void> {
    // No expiry: the refresh token lives until disconnect or Spotify revokes it.
    if (token === null) await this.redis.del(KEY);
    else await this.redis.set(KEY, token);
  }
}
