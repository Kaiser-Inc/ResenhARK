import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroBoat } from "../components/brand/hero-boat";
import { GameCard } from "../components/home/game-card";
import { GAME_RULES } from "./game-rules";

test("home cards are labelled toggle buttons with the approved copy and a hidden rules face", () => {
  for (const game of ["hitline", "huehint"] as const) {
    const markup = renderToStaticMarkup(createElement(GameCard, { game }));
    assert.match(markup, /<button/);
    assert.match(markup, /aria-pressed="false"/);
    assert.ok(markup.includes(GAME_RULES[game].summary));
    assert.match(markup, /data-face="back" aria-hidden="true"/);
  }
});

test("the decorative hero boat reuses all three existing logo pieces", () => {
  const markup = renderToStaticMarkup(createElement(HeroBoat));
  assert.match(markup, /aria-hidden="true"/);
  for (const piece of ["bubble", "hull-left", "hull-right"]) {
    assert.ok(markup.includes(`data-logo-piece="${piece}"`));
  }
});
