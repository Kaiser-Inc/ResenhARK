import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  type TestServer,
  type TestSession,
  createRoomVia,
  startTestServer,
} from "../../../test/helpers.js";
import { settings } from "../../core/settings.js";
import type { Card } from "../../games/hitline/engine.js";
import { audioPath, audioTicket } from "../audio-tickets.js";

const BODY = Buffer.from("fake-mp3-bytes");
const PROVIDER_URL = "https://cdnt-preview.dzcdn.net/secret.mp3";
const card: Card = {
  id: "c1",
  title: "505",
  artists: ["Arctic Monkeys"],
  year: 2007,
  isrc: "GBCEL0700074",
  spotifyUrl: null,
};

let app: TestServer;
let owner: TestSession;
const fetched: string[] = [];
let lookups = 0;
let failBody = false;

before(async () => {
  app = await startTestServer({
    audio: {
      findPreviewUrl: async () => {
        lookups += 1;
        return PROVIDER_URL;
      },
    },
    fetchAudio: async (url) => {
      fetched.push(url);
      if (failBody) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("boom"));
            },
          }),
          { headers: { "content-type": "audio/mpeg" } },
        );
      }
      return new Response(BODY, {
        headers: { "content-type": "audio/mpeg", "x-origin": "dzcdn" },
      });
    },
  });
  owner = await createRoomVia(app, "Ana");
});
after(() => app.close());

async function seedDraw(drawId: string | null): Promise<void> {
  const room = (await app.store.load(owner.code)) as unknown as Record<string, unknown>;
  room.game = { type: "hitline", state: { draw: drawId ? { id: drawId, card } : null } };
  await app.store.save(room as never);
  if (drawId) await app.store.indexDraw(drawId, owner.code);
}
const get = (url: string) => app.fastify.inject({ method: "GET", url });
const ticketPath = (drawId: string, memberId = owner.memberId) =>
  audioPath(settings.SESSION_SECRET, drawId, memberId);

test("audio streams for a member with a valid ticket on the current draw", async () => {
  await seedDraw("d1");
  const res = await get(ticketPath("d1"));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "audio/mpeg");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.deepEqual(res.rawPayload, BODY);
  assert.deepEqual(fetched.at(-1), PROVIDER_URL);
});

test("invalid ticket returns 404", async () => {
  await seedDraw("d1");
  const res = await get(`/audio/d1?m=${owner.memberId}&t=bogus`);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: "not-found" });
  // ticket minted for another member
  const other = audioTicket(settings.SESSION_SECRET, "d1", "someone-else");
  assert.equal((await get(`/audio/d1?m=${owner.memberId}&t=${other}`)).statusCode, 404);
  // valid ticket but not a room member
  assert.equal((await get(ticketPath("d1", "ghost"))).statusCode, 404);
  assert.equal((await get("/audio/d1")).statusCode, 404);
});

test("an old drawId returns 404 after the next draw", async () => {
  await seedDraw("d1");
  const old = ticketPath("d1");
  await seedDraw("d2");
  assert.equal((await get(old)).statusCode, 404);
  assert.equal((await get(ticketPath("d2"))).statusCode, 200);
});

test("response never contains the provider URL", async () => {
  await seedDraw("d3");
  const res = await get(ticketPath("d3"));
  const dump = JSON.stringify(res.headers) + res.body;
  assert.ok(!dump.includes("dzcdn") && !dump.includes("itunes"));
  await seedDraw(null);
  const miss = await get(ticketPath("d3"));
  assert.equal(miss.statusCode, 404);
  assert.ok(!(JSON.stringify(miss.headers) + miss.body).includes("dzcdn"));
});

test("a failing upstream body stream returns 404", async () => {
  await seedDraw("d4");
  failBody = true;
  try {
    const res = await get(ticketPath("d4"));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: "not-found" });
  } finally {
    failBody = false;
  }
});

test("many viewers of one draw cost a single provider lookup and fetch", async () => {
  await seedDraw("d5");
  const [lookupsBefore, fetchedBefore] = [lookups, fetched.length];
  const responses = await Promise.all(Array.from({ length: 8 }, () => get(ticketPath("d5"))));
  for (const res of responses) assert.deepEqual(res.rawPayload, BODY);
  await get(ticketPath("d5"));
  assert.equal(lookups - lookupsBefore, 1);
  assert.equal(fetched.length - fetchedBefore, 1);
});

const range = (drawId: string, value: string) =>
  app.fastify.inject({ method: "GET", url: ticketPath(drawId), headers: { range: value } });

test("a Range request is served as 206 with the right slice from the buffer", async () => {
  await seedDraw("d6");
  const fetchedBefore = fetched.length;
  const res = await range("d6", "bytes=2-5");
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers["content-range"], `bytes 2-5/${BODY.length}`);
  assert.equal(res.headers["accept-ranges"], "bytes");
  assert.equal(res.headers["content-length"], "4");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.deepEqual(res.rawPayload, BODY.subarray(2, 6));
  const open = await range("d6", "bytes=10-");
  assert.deepEqual(open.rawPayload, BODY.subarray(10));
  assert.equal(open.headers["content-range"], `bytes 10-${BODY.length - 1}/${BODY.length}`);
  const suffix = await range("d6", "bytes=-3");
  assert.deepEqual(suffix.rawPayload, BODY.subarray(BODY.length - 3));
  assert.equal(fetched.length - fetchedBefore, 1);
});

test("an unsatisfiable or invalid Range returns 416", async () => {
  await seedDraw("d7");
  for (const value of [`bytes=${BODY.length}-`, "bytes=5-2", "bytes=-0", "bytes=a-b"]) {
    const res = await range("d7", value);
    assert.equal(res.statusCode, 416, value);
    assert.equal(res.headers["content-range"], `bytes */${BODY.length}`);
  }
});
