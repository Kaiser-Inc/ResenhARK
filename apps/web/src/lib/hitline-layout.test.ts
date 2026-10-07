import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Timeline } from "../components/hitline/timeline";
import { HITLINE_TARGET_CARDS } from "./config-options";

test("Hitline offers the approved five winning sizes", () => {
  assert.deepEqual(HITLINE_TARGET_CARDS, [5, 7, 10, 12, 15]);
});

test("a fifteen-card timeline grows with the page and keeps all sixteen gaps", () => {
  const markup = renderToStaticMarkup(
    createElement(Timeline, {
      ownerName: "Ana",
      cards: Array.from({ length: 15 }, (_, i) => ({
        id: `card-${i}`,
        title: `Music ${i}`,
        artists: ["Artist"],
        year: 1960 + i,
        spotifyUrl: null,
      })),
      interactive: true,
      selectedSlot: null,
      onSelect: () => {},
    }),
  );
  assert.equal((markup.match(/data-gap=/g) ?? []).length, 16);
  assert.doesNotMatch(markup, /max-h-|overflow-y-auto/);
});
