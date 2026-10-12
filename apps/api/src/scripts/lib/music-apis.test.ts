import assert from "node:assert/strict";
import { test } from "node:test";
import { getJson } from "./music-apis.js";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Replaces fetch with a script of responses (the last one repeats) and counts the calls. */
function stubFetch(t: { after: (fn: () => void) => void }, script: (() => Response)[]) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => script[Math.min(calls++, script.length - 1)]()) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  return () => calls;
}

test("getJson treats a Deezer error body sent with HTTP 200 as a failure and retries", async (t) => {
  const calls = stubFetch(t, [
    () => reply({ error: { type: "Exception", message: "Quota limit exceeded", code: 4 } }),
    () => reply({ id: 1 }),
  ]);
  assert.deepEqual(await getJson("https://x.test/a", 0), { id: 1 });
  assert.equal(calls(), 2);
});

test("getJson gives up on a persistent error body instead of returning it", async (t) => {
  stubFetch(t, [() => reply({ error: { code: 4 } })]);
  await assert.rejects(getJson("https://x.test/a", 0), /kept failing/);
});

test("getJson returns null for Deezer's no-data error and for a 404", async (t) => {
  stubFetch(t, [() => reply({ error: { type: "DataException", message: "no data", code: 800 } })]);
  assert.equal(await getJson("https://x.test/a", 0), null);
  stubFetch(t, [() => reply({}, 404)]);
  assert.equal(await getJson("https://x.test/b", 0), null);
});

test("getJson retries when the network call itself throws", async (t) => {
  let first = true;
  stubFetch(t, [
    () => {
      if (first) {
        first = false;
        throw new TypeError("fetch failed");
      }
      return reply({ ok: true });
    },
  ]);
  assert.deepEqual(await getJson("https://x.test/a", 0), { ok: true });
});
