import assert from "node:assert/strict";
import { test } from "node:test";
import { SpotifyAuth, type SpotifyTokenStore } from "./spotify-auth.js";

function memStore(initial: string | null = null): SpotifyTokenStore & { value: string | null } {
  const s = {
    value: initial,
    getRefreshToken: async () => s.value,
    setRefreshToken: async (t: string | null) => {
      s.value = t;
    },
  };
  return s;
}
const mk = (store: SpotifyTokenStore, fetchFn: typeof fetch, now = () => 0) =>
  new SpotifyAuth({
    clientId: "cid",
    clientSecret: "sec",
    redirectUri: "http://cb/x",
    store,
    fetchFn,
    now,
  });

test("authorizeUrl carries scopes, redirect and state, never the secret", () => {
  const url = new URL(mk(memStore(), fetch).authorizeUrl("st8"));
  assert.equal(url.origin + url.pathname, "https://accounts.spotify.com/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("scope"), "playlist-read-private playlist-read-collaborative");
  assert.equal(url.searchParams.get("redirect_uri"), "http://cb/x");
  assert.equal(url.searchParams.get("state"), "st8");
  assert.ok(!url.toString().includes("sec"));
});

test("exchangeCode posts with Basic auth and stores the refresh token", async () => {
  const store = memStore();
  let req: { url: string; init?: RequestInit } | undefined;
  const auth = mk(store, async (url, init) => {
    req = { url: String(url), init };
    return Response.json({ access_token: "a", refresh_token: "r1", expires_in: 3600 });
  });
  await auth.exchangeCode("CODE");
  assert.equal(req?.url, "https://accounts.spotify.com/api/token");
  const headers = req?.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Basic ${Buffer.from("cid:sec").toString("base64")}`);
  const body = new URLSearchParams(String(req?.init?.body));
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "CODE");
  assert.equal(store.value, "r1");
  assert.equal(await auth.isConnected(), true);
});

test("accessToken caches until expires_in - 60 s, then refreshes", async () => {
  let t = 0;
  let calls = 0;
  const auth = mk(
    memStore("r"),
    async () => Response.json({ access_token: `a${++calls}`, expires_in: 3600 }),
    () => t,
  );
  assert.equal(await auth.accessToken(), "a1");
  t = 3539_000;
  assert.equal(await auth.accessToken(), "a1");
  t = 3540_000;
  assert.equal(await auth.accessToken(), "a2");
});

test("no refresh token means null and not connected", async () => {
  const auth = mk(memStore(), async () => assert.fail("no network"));
  assert.equal(await auth.accessToken(), null);
  assert.equal(await auth.isConnected(), false);
});

test("invalid_grant on refresh clears the token", async () => {
  const store = memStore("r");
  const auth = mk(store, async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
  assert.equal(await auth.accessToken(), null);
  assert.equal(store.value, null);
});

test("refresh stores a rotated refresh token", async () => {
  const store = memStore("r");
  const auth = mk(store, async () =>
    Response.json({ access_token: "a", refresh_token: "r2", expires_in: 60 }),
  );
  await auth.accessToken();
  assert.equal(store.value, "r2");
});
