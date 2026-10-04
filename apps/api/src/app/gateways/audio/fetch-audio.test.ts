import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SILENCE_MP3_URL, createFetchAudio, isAllowedAudioUrl } from "./fetch-audio.js";

const ok = (body: string, headers: Record<string, string> = {}) =>
  (async () => new Response(body, { headers })) as typeof fetch;

test("fixture asset exists at the resolved path and is served for the sentinel", async () => {
  assert.ok(existsSync(fileURLToPath(SILENCE_MP3_URL)));
  const res = await createFetchAudio(ok("never"))("fixture:silence");
  assert.equal(res.headers.get("content-type"), "audio/mpeg");
  assert.ok((await res.arrayBuffer()).byteLength > 1000);
});

test("only https URLs on provider hosts are allowed", () => {
  assert.ok(isAllowedAudioUrl("https://cdnt-preview.dzcdn.net/x.mp3"));
  assert.ok(isAllowedAudioUrl("https://audio-ssl.itunes.apple.com/a.m4a"));
  assert.ok(isAllowedAudioUrl("https://audio-ssl.itunes.apple.com/a.m4a"));
  assert.ok(isAllowedAudioUrl("https://x.mzstatic.com/a.m4a"));
  assert.ok(!isAllowedAudioUrl("http://cdnt-preview.dzcdn.net/x.mp3"));
  assert.ok(!isAllowedAudioUrl("https://evil.com/x.mp3"));
  assert.ok(!isAllowedAudioUrl("https://dzcdn.net.evil.com/x.mp3"));
  assert.ok(!isAllowedAudioUrl("https://notdzcdn.net/x.mp3"));
  assert.ok(!isAllowedAudioUrl("file:///etc/passwd"));
  assert.ok(!isAllowedAudioUrl("nonsense"));
});

test("rejected host or scheme never reaches fetch", async () => {
  let called = 0;
  const f = createFetchAudio((async () => {
    called++;
    return new Response("x");
  }) as typeof fetch);
  await assert.rejects(f("https://evil.com/a.mp3"));
  await assert.rejects(f("http://x.dzcdn.net/a.mp3"));
  assert.equal(called, 0);
});

test("oversize bodies are rejected, declared or not", async () => {
  const url = "https://x.dzcdn.net/a.mp3";
  await assert.rejects(createFetchAudio(ok("12345678", { "content-length": "8" }), 4)(url));
  await assert.rejects(createFetchAudio(ok("12345678"), 4)(url));
  const res = await createFetchAudio(ok("1234"), 4)(url);
  assert.equal(await res.text(), "1234");
});

test("fetch is called with redirect error and a timeout signal", async () => {
  let init: RequestInit | undefined;
  await createFetchAudio((async (_u, i) => {
    init = i;
    return new Response("x");
  }) as typeof fetch)("https://x.dzcdn.net/a.mp3");
  assert.equal(init?.redirect, "error");
  assert.ok(init?.signal instanceof AbortSignal);
});
