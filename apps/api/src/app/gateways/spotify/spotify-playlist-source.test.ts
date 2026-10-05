import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SpotifyAuth } from "./spotify-auth.js";
import { SpotifyPlaylistSource, parsePlaylistId } from "./spotify-playlist-source.js";

const ID = "37i9dQZF1DXcBWIGoYBM5M";
const fx = (n: number) =>
  JSON.parse(readFileSync(new URL(`./fixtures/playlist-page-${n}.json`, import.meta.url), "utf8"));

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
function setup(handler: Handler, refreshToken: string | null = "r") {
  const sleeps: number[] = [];
  const urls: string[] = [];
  let refreshes = 0;
  const fetchFn = (async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    urls.push(url);
    if (url.startsWith("https://accounts.spotify.com/api/token")) {
      refreshes++;
      return Response.json({ access_token: `tok${refreshes}`, expires_in: 3600 });
    }
    return handler(url, init);
  }) as typeof fetch;
  let token = refreshToken;
  const auth = new SpotifyAuth({
    clientId: "c",
    clientSecret: "s",
    redirectUri: "r",
    store: {
      getRefreshToken: async () => token,
      setRefreshToken: async (t) => {
        token = t;
      },
    },
    fetchFn,
    now: () => 0,
  });
  let n = 0;
  const source = new SpotifyPlaylistSource({
    auth,
    fetchFn,
    newId: () => `id${++n}`,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { source, sleeps, urls, refreshes: () => refreshes };
}
const link = `https://open.spotify.com/playlist/${ID}`;
const happy: Handler = (url) => {
  if (url.includes("fields=name")) return Response.json({ name: "Team mix" });
  return Response.json(url.includes("offset=3") ? fx(2) : fx(1));
};

test("parsePlaylistId accepts web and URI links", () => {
  assert.equal(parsePlaylistId(`${link}?si=abc`), ID);
  assert.equal(parsePlaylistId(`spotify:playlist:${ID}`), ID);
  assert.equal(parsePlaylistId("https://example.com"), null);
  assert.equal(parsePlaylistId("https://open.spotify.com/playlist/short"), null);
});

test("load follows pagination and maps cards with the album year", async () => {
  const { source, urls } = setup(happy);
  const r = await source.load(link);
  assert.ok(r.ok);
  assert.equal(r.playlist.name, "Team mix");
  assert.ok(
    urls.some((u) => u.includes(`/v1/playlists/${ID}/items?limit=50&additional_types=track`)),
  );
  assert.deepEqual(
    r.playlist.cards.map((c) => [c.title, c.year]),
    [
      ["Mr. Brightside", 2004],
      ["Bohemian Rhapsody", 1975],
      ["No ISRC", 2007],
      ["Legacy Track Field", 1999],
    ],
  );
  assert.deepEqual(r.playlist.cards[0], {
    id: "id1",
    title: "Mr. Brightside",
    artists: ["The Killers"],
    year: 2004,
    isrc: "ISRCt1",
    spotifyUrl: "https://open.spotify.com/track/t1",
  });
});

test("load skips episodes, local files and null items, keeps tracks without ISRC and dedupes repeats", async () => {
  const { source } = setup(happy);
  const r = await source.load(link);
  assert.ok(r.ok);
  const titles = r.playlist.cards.map((c) => c.title);
  assert.ok(!titles.includes("Podcast ep") && !titles.includes("Local Song"));
  assert.equal(titles.filter((t) => t === "Mr. Brightside").length, 1);
  assert.equal(r.playlist.cards.find((c) => c.title === "No ISRC")?.isrc, null);
  assert.deepEqual(r.playlist.cards.find((c) => c.title === "No ISRC")?.artists, ["A", "B"]);
});

test("invalid link, 403/404 and empty result map to typed errors", async () => {
  assert.deepEqual(await setup(happy).source.load("nope"), {
    ok: false,
    error: "playlist-invalid-link",
  });
  for (const status of [403, 404]) {
    const r = await setup(() => new Response("{}", { status })).source.load(link);
    assert.deepEqual(r, { ok: false, error: "playlist-no-access" });
  }
  const empty = setup((url) =>
    url.includes("fields=name")
      ? Response.json({ name: "x" })
      : Response.json({ next: null, items: [{ item: { type: "episode", id: "e" } }] }),
  );
  assert.deepEqual(await empty.source.load(link), { ok: false, error: "playlist-empty" });
});

test("429 waits Retry-After and retries, with exponential backoff, max 3", async () => {
  let n = 0;
  const ok = setup((url) => {
    if (n++ === 0) return new Response("", { status: 429, headers: { "Retry-After": "2" } });
    return happy(url);
  });
  assert.ok((await ok.source.load(link)).ok);
  assert.deepEqual(ok.sleeps, [2000]);

  const bad = setup(() => new Response("", { status: 429, headers: { "Retry-After": "1" } }));
  await assert.rejects(bad.source.load(link));
  assert.deepEqual(bad.sleeps, [1000, 2000, 4000]);
});

test("401 refreshes the token once and retries", async () => {
  let first = true;
  const t = setup((url, init) => {
    const auth = (init?.headers as Record<string, string>).Authorization;
    if (first && url.includes("fields=name")) {
      first = false;
      assert.equal(auth, "Bearer tok1");
      return new Response("", { status: 401 });
    }
    return happy(url);
  });
  assert.ok((await t.source.load(link)).ok);
  assert.equal(t.refreshes(), 2);
  const always = setup(() => new Response("", { status: 401 }));
  await assert.rejects(always.source.load(link));
});

test("no refresh token means spotify-disconnected", async () => {
  const r = await setup(happy, null).source.load(link);
  assert.deepEqual(r, { ok: false, error: "spotify-disconnected" });
});

const rateLimited = (retryAfter?: string) =>
  setup(() =>
    retryAfter === undefined
      ? new Response("", { status: 429 })
      : new Response("", { status: 429, headers: { "Retry-After": retryAfter } }),
  );

test("429 fails fast when Retry-After exceeds the cap and falls back to 1 s when unusable", async () => {
  const huge = rateLimited("3600");
  await assert.rejects(huge.source.load(link));
  assert.deepEqual(huge.sleeps, []);
  for (const v of [undefined, "Wed, 21 Oct 2026 07:28:00 GMT"]) {
    const t = rateLimited(v);
    await assert.rejects(t.source.load(link));
    assert.deepEqual(t.sleeps, [1000, 2000, 4000]);
  }
});

test("429 stops when the total wait budget is exhausted", async () => {
  const t = rateLimited("10");
  await assert.rejects(t.source.load(link));
  assert.deepEqual(t.sleeps, [10000, 20000]);
});

test("tracks with a missing or invalid release_date are skipped", async () => {
  const mk = (id: string, release_date?: string) => ({
    item: {
      type: "track",
      id,
      name: id,
      artists: [{ name: "a" }],
      album: release_date === undefined ? {} : { release_date },
      external_urls: { spotify: "u" },
    },
  });
  const t = setup((url) =>
    url.includes("fields=name")
      ? Response.json({ name: "x" })
      : Response.json({
          next: null,
          items: [mk("a"), mk("b", "abcd"), mk("c", "0"), mk("d", "2001-01-01")],
        }),
  );
  const r = await t.source.load(link);
  assert.ok(r.ok);
  assert.deepEqual(
    r.playlist.cards.map((c) => c.title),
    ["d"],
  );
});

test("a next link on a foreign origin is rejected and never fetched", async () => {
  const t = setup((url) =>
    url.includes("fields=name")
      ? Response.json({ name: "x" })
      : Response.json({ next: "https://evil.example/steal", items: [] }),
  );
  await assert.rejects(t.source.load(link));
  assert.ok(!t.urls.some((u) => u.includes("evil.example")));
});

test("pagination is capped", async () => {
  const t = setup((url) =>
    url.includes("fields=name")
      ? Response.json({ name: "x" })
      : Response.json({
          next: `https://api.spotify.com/v1/playlists/${ID}/items?offset=1`,
          items: [],
        }),
  );
  await assert.rejects(t.source.load(link));
  assert.ok(t.urls.length <= 52);
});
