import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Redis } from "ioredis";
import { TEST_REDIS_URL, type TestServer, startTestServer } from "../../../test/helpers.js";
import { settings } from "../../core/settings.js";
import { SpotifyAuth } from "../../gateways/spotify/spotify-auth.js";
import { RedisSpotifyTokenStore } from "../../repositories/redis-spotify-token-store.js";

let app: TestServer;
let tokenRedis: Redis;
let exchangeOk = true;
const CODE = "the-auth-code";
const ERROR_URL = `${settings.WEB_URL}/admin/spotify?status=error`;

before(async () => {
  tokenRedis = new Redis(TEST_REDIS_URL);
  const spotifyAuth = new SpotifyAuth({
    clientId: "cid",
    clientSecret: "secret",
    redirectUri: "http://api.test/admin/spotify/callback",
    store: new RedisSpotifyTokenStore(tokenRedis),
    now: () => 1_000_000,
    fetchFn: async () =>
      exchangeOk
        ? Response.json({ access_token: "at", refresh_token: "rt-secret", expires_in: 3600 })
        : Response.json({ error: "invalid_grant" }, { status: 400 }),
  });
  app = await startTestServer({ spotifyAuth });
});

after(async () => {
  await app.close();
  tokenRedis.disconnect();
});

const login = (server: TestServer, password: string) =>
  server.fastify.inject({ method: "POST", url: "/admin/login", payload: { password } });
const get = (server: TestServer, url: string, token?: string) =>
  server.fastify.inject({
    method: "GET",
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
const authorize = (server: TestServer, token?: string) =>
  server.fastify.inject({
    method: "POST",
    url: "/admin/spotify/authorize",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
const adminToken = async (server: TestServer) =>
  ((await login(server, settings.ADMIN_PASSWORD)).json() as { adminToken: string }).adminToken;

test("wrong password is 401 and status without token is 401", async () => {
  const res = await login(app, "nope");
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json(), { error: "invalid-password" });
  assert.equal((await get(app, "/admin/spotify/status")).statusCode, 401);
  assert.equal((await authorize(app)).statusCode, 401);
  assert.equal((await authorize(app, "bogus")).statusCode, 401);
  const dis = await app.fastify.inject({ method: "POST", url: "/admin/spotify/disconnect" });
  assert.equal(dis.statusCode, 401);
});

test("login, authorize redirects to Spotify with state, callback stores the token and status says connected", async () => {
  app.clock.set(10_000_000);
  const token = await adminToken(app);
  assert.ok(await tokenRedis.get(`admin:${token}`));
  assert.ok((await tokenRedis.ttl(`admin:${token}`)) > 3500);
  assert.deepEqual((await get(app, "/admin/spotify/status", token)).json(), {
    connected: false,
    configured: true,
  });

  const authz = await authorize(app, token);
  assert.equal(authz.statusCode, 200);
  const location = new URL((authz.json() as { authorizeUrl: string }).authorizeUrl);
  assert.equal(location.origin, "https://accounts.spotify.com");
  const state = location.searchParams.get("state") as string;
  assert.ok(state);
  assert.ok((await tokenRedis.ttl(`oauth-state:${state}`)) > 500);

  const cb = await get(app, `/admin/spotify/callback?code=${CODE}&state=${state}`);
  assert.equal(cb.statusCode, 302);
  assert.equal(cb.headers.location, `${settings.WEB_URL}/admin/spotify?status=connected`);
  assert.equal(await tokenRedis.get("spotify:refresh"), "rt-secret");
  assert.equal(await tokenRedis.ttl("spotify:refresh"), -1);

  const replay = await get(app, `/admin/spotify/callback?code=${CODE}&state=${state}`);
  assert.equal(replay.headers.location, ERROR_URL);

  assert.deepEqual((await get(app, "/admin/spotify/status", token)).json(), {
    connected: true,
    configured: true,
  });
  const dis = await app.fastify.inject({
    method: "POST",
    url: "/admin/spotify/disconnect",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(dis.statusCode, 204);
  assert.equal(await tokenRedis.get("spotify:refresh"), null);
});

test("callback with an unknown state redirects with status=error", async () => {
  const cb = await get(app, `/admin/spotify/callback?code=${CODE}&state=bogus`);
  assert.equal(cb.statusCode, 302);
  assert.equal(cb.headers.location, ERROR_URL);
});

test("failed code exchange redirects with status=error and echoes nothing", async () => {
  app.clock.set(20_000_000);
  const token = await adminToken(app);
  const authz = await authorize(app, token);
  const state = new URL((authz.json() as { authorizeUrl: string }).authorizeUrl).searchParams.get(
    "state",
  );
  exchangeOk = false;
  const cb = await get(app, `/admin/spotify/callback?code=${CODE}&state=${state}`);
  exchangeOk = true;
  assert.equal(cb.headers.location, ERROR_URL);
});

test("login is rate limited per IP", async () => {
  app.clock.set(30_000_000);
  for (let i = 0; i < 5; i++) assert.equal((await login(app, "nope")).statusCode, 401);
  assert.equal((await login(app, settings.ADMIN_PASSWORD)).statusCode, 429);
  app.clock.set(30_000_000 + 61_000);
  assert.equal((await login(app, settings.ADMIN_PASSWORD)).statusCode, 200);
});

test("without Spotify configured authorize/callback are 503 and status is disconnected", async () => {
  const bare = await startTestServer();
  try {
    const token = await adminToken(bare);
    const authz = await authorize(bare, token);
    assert.equal(authz.statusCode, 503);
    assert.deepEqual(authz.json(), { error: "spotify-not-configured" });
    assert.equal((await get(bare, "/admin/spotify/callback?code=a&state=b")).statusCode, 503);
    assert.deepEqual((await get(bare, "/admin/spotify/status", token)).json(), {
      connected: false,
      configured: false,
    });
    const dis = await bare.fastify.inject({
      method: "POST",
      url: "/admin/spotify/disconnect",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(dis.statusCode, 204);
  } finally {
    await bare.close();
  }
});

test("rate limit buckets follow X-Forwarded-For only when proxies are trusted", async () => {
  const attempt = (server: TestServer, ip: string) =>
    server.fastify.inject({
      method: "POST",
      url: "/admin/login",
      headers: { "x-forwarded-for": ip },
      payload: { password: "nope" },
    });
  const trusted = await startTestServer({ trustProxyHops: 1 });
  const direct = await startTestServer({ trustProxyHops: 0 });
  try {
    for (const server of [trusted, direct]) {
      for (let i = 0; i < 5; i++) await attempt(server, "1.1.1.1");
    }
    assert.equal((await attempt(trusted, "1.1.1.1")).statusCode, 429);
    assert.equal((await attempt(trusted, "2.2.2.2")).statusCode, 401);
    // Header ignored: the spoofed address shares the real client's exhausted bucket.
    assert.equal((await attempt(direct, "3.3.3.3")).statusCode, 429);
  } finally {
    await trusted.close();
    await direct.close();
  }
});
