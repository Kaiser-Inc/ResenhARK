import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomHomeLink } from "../components/room/room-home-link";

test("room logos remain labelled home links in the lobby and during a game", () => {
  for (const gameRunning of [false, true]) {
    const markup = renderToStaticMarkup(
      createElement(RoomHomeLink, { code: "ABCDE", gameRunning }, "ResenhARK"),
    );
    assert.match(markup, /href="\/"/);
    assert.match(markup, /aria-label="ResenhARK, início"/);
  }
});
