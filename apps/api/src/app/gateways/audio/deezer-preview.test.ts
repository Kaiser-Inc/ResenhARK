import assert from "node:assert/strict";
import { test } from "node:test";
import { DeezerPreview } from "./deezer-preview.js";

test("deezer looks up by ISRC and returns the preview", async () => {
  const calls: string[] = [];
  const src = new DeezerPreview(async (url) => {
    calls.push(String(url));
    return Response.json({ preview: "https://cdnt-preview.dzcdn.net/x.mp3" });
  });
  assert.equal(
    await src.findPreviewUrl({ title: "505", artists: ["Arctic Monkeys"], isrc: "GBCEL0700074" }),
    "https://cdnt-preview.dzcdn.net/x.mp3",
  );
  assert.equal(calls[0], "https://api.deezer.com/track/isrc:GBCEL0700074");
});

test("deezer returns null without ISRC or with an error payload", async () => {
  let called = 0;
  const src = new DeezerPreview(async () => {
    called++;
    return Response.json({ error: { type: "DataException", code: 800 } });
  });
  assert.equal(await src.findPreviewUrl({ title: "a", artists: ["b"], isrc: null }), null);
  assert.equal(called, 0);
  assert.equal(await src.findPreviewUrl({ title: "a", artists: ["b"], isrc: "X" }), null);
  const failing = new DeezerPreview(async () => {
    throw new Error("network");
  });
  assert.equal(await failing.findPreviewUrl({ title: "a", artists: ["b"], isrc: "X" }), null);
});
