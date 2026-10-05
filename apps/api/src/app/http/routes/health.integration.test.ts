import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Redis } from "ioredis";
import { type TestServer, startTestServer } from "../../../test/helpers.js";

let app: TestServer;
let deadRedis: Redis;

before(async () => {
  // Port 1 is closed: every command must fail fast instead of queueing.
  deadRedis = new Redis("redis://127.0.0.1:1", {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  deadRedis.on("error", () => {});
  app = await startTestServer({ redis: deadRedis });
});

after(async () => {
  await app.close();
});

test("GET /health reports redis down when Redis is unreachable", async () => {
  const res = await fetch(`${app.url}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok", redis: "down" });
});
