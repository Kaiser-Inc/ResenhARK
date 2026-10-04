import assert from "node:assert/strict";
import { test } from "node:test";
import { ItunesPreview } from "./itunes-preview.js";

test("itunes returns the first result that has a previewUrl", async () => {
  const calls: string[] = [];
  const src = new ItunesPreview(async (url) => {
    calls.push(String(url));
    return Response.json({ results: [{}, { previewUrl: "u" }, { previewUrl: "v" }] });
  });
  assert.equal(
    await src.findPreviewUrl({ title: "505 & co", artists: ["Arctic Monkeys"], isrc: null }),
    "u",
  );
  assert.equal(
    calls[0],
    "https://itunes.apple.com/search?term=Arctic%20Monkeys%20505%20%26%20co&entity=song&limit=5&country=BR",
  );
});

test("itunes returns null when nothing matches or the request fails", async () => {
  const empty = new ItunesPreview(async () => Response.json({ results: [{}] }));
  assert.equal(await empty.findPreviewUrl({ title: "a", artists: ["b"], isrc: null }), null);
  const failing = new ItunesPreview(async () => new Response("no", { status: 500 }));
  assert.equal(await failing.findPreviewUrl({ title: "a", artists: ["b"], isrc: null }), null);
});
