import assert from "node:assert/strict";
import { test } from "node:test";
import { ChainedPreview } from "./chained-preview.js";

const card = { title: "t", artists: ["a"], isrc: null };
const fixed = (v: string | null) => ({ findPreviewUrl: async () => v });

test("chained preview falls back to the next source", async () => {
  assert.equal(
    await new ChainedPreview([fixed(null), fixed("x"), fixed("y")]).findPreviewUrl(card),
    "x",
  );
  assert.equal(await new ChainedPreview([fixed(null)]).findPreviewUrl(card), null);
});
