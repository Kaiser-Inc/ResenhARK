import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MemberAvatar, type MemberExpression } from "./member-avatar";

function render(size: number, expression: MemberExpression) {
  return renderToStaticMarkup(
    createElement(MemberAvatar, {
      name: "Kaiser",
      avatar: { hue: 262, shape: "hexagon" },
      size,
      expression,
    }),
  );
}

// The SVG ships as a data-URI <img>: decode it. Second fill is the head (1st is the backdrop circle),
// and the first <path> inside the head group is the body silhouette.
const svg = (html: string) =>
  decodeURIComponent(/src="data:image\/svg\+xml,([^"]+)"/.exec(html)?.[1] ?? "").replaceAll(
    "&#x27;",
    "'",
  );
const headFill = (html: string) => [...svg(html).matchAll(/fill='([^']+)'/g)][1]?.[1];
const bodyPath = (html: string) => /<g fill='[^']+'><path d='([^']+)'/.exec(svg(html))?.[1];

test("same member keeps head color and body silhouette at 32/idle and 96/love", () => {
  const small = render(32, "idle");
  const big = render(96, "love");
  assert.ok(bodyPath(small) && headFill(small), "head and body found");
  assert.deepEqual(headFill(big), headFill(small));
  assert.equal(bodyPath(big), bodyPath(small));
});

test("no expression retints the head", () => {
  const base = headFill(render(32, "idle"));
  for (const e of ["happy", "sad", "mad", "thinking", "love"] as const) {
    assert.equal(headFill(render(96, e)), base, e);
  }
});
