import assert from "node:assert/strict";
import { test } from "node:test";
import { seededRng } from "../../core/seeded-rng.js";
import { drawColors, saturationBand } from "./palette.js";

const GAMES = 4000;
const ROUNDS = 12;
const games = (() => {
  const rng = seededRng(7);
  return Array.from({ length: GAMES }, () => drawColors(ROUNDS, rng));
})();
const sector = (h: number) => Math.floor(h / 60);

test("drawColors returns the asked count of integer colors in range", () => {
  for (const g of games) {
    assert.equal(g.length, ROUNDS);
    for (const c of g) {
      for (const v of [c.h, c.s, c.b]) assert.ok(Number.isInteger(v));
      assert.ok(c.h >= 0 && c.h <= 359);
      assert.ok(c.s >= 0 && c.s <= 100);
      assert.ok(c.b >= 15 && c.b <= 95, `brightness ${c.b}`);
    }
  }
});

test("at most one neutral color per game", () => {
  for (const g of games) assert.ok(g.filter((c) => saturationBand(c.s) === "neutral").length <= 1);
});

test("first color follows the 70/20/10 saturation weights", () => {
  const count = { vivid: 0, soft: 0, neutral: 0 };
  for (const g of games) count[saturationBand(g[0].s)] += 1;
  const pct = (n: number) => (n / GAMES) * 100;
  assert.ok(Math.abs(pct(count.vivid) - 70) < 3, `vivid ${pct(count.vivid)}`);
  assert.ok(Math.abs(pct(count.soft) - 20) < 3, `soft ${pct(count.soft)}`);
  assert.ok(Math.abs(pct(count.neutral) - 10) < 3, `neutral ${pct(count.neutral)}`);
});

test("consecutive rounds never share a hue sector and each block of 6 covers all sectors", () => {
  for (const g of games) {
    for (let i = 1; i < g.length; i++) assert.notEqual(sector(g[i].h), sector(g[i - 1].h));
    for (let i = 0; i + 6 <= g.length; i += 6) {
      assert.equal(new Set(g.slice(i, i + 6).map((c) => sector(c.h))).size, 6);
    }
  }
});

test("saturationBand splits at 15 and 40", () => {
  assert.equal(saturationBand(14), "neutral");
  assert.equal(saturationBand(15), "soft");
  assert.equal(saturationBand(39), "soft");
  assert.equal(saturationBand(40), "vivid");
});
