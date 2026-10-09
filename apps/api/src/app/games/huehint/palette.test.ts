import assert from "node:assert/strict";
import { test } from "node:test";
import { seededRng } from "../../core/seeded-rng.js";
import { deltaE2000, hsbToLab } from "./color.js";
import {
  DARK_BELOW,
  MIN_DELTA_E,
  NEWEST_COUNT,
  OLDER_DELTA_E,
  RECENT_DELTA_E,
  drawColors,
  saturationBand,
} from "./palette.js";

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

test("at most one dark color in any 6 consecutive rounds", () => {
  for (const g of games) {
    for (let i = 0; i + 6 <= g.length; i++) {
      const dark = g.slice(i, i + 6).filter((c) => c.b < DARK_BELOW).length;
      assert.ok(dark <= 1, `${dark} dark colors in rounds ${i + 1} to ${i + 6}`);
    }
  }
});

const de = (a: Parameters<typeof hsbToLab>[0], b: Parameters<typeof hsbToLab>[0]) =>
  deltaE2000(hsbToLab(a), hsbToLab(b));

test("a solo game's 5 colors are MIN_DELTA_E apart in almost every game", () => {
  const rng = seededRng(11);
  let apart = 0;
  for (let n = 0; n < 2000; n++) {
    const g = drawColors(5, rng);
    const closest = Math.min(...g.flatMap((a, i) => g.slice(i + 1).map((b) => de(a, b))));
    if (closest >= MIN_DELTA_E) apart += 1;
  }
  assert.ok(apart / 2000 >= 0.99, `${apart} of 2000`);
});

test("in long games each color keeps clear of the last 5, and MIN_DELTA_E from them 95% of the time", () => {
  let checked = 0;
  let clear = 0;
  for (const g of games) {
    for (let i = 1; i < g.length; i++) {
      const closest = Math.min(...g.slice(Math.max(0, i - 5), i).map((b) => de(g[i], b)));
      assert.ok(closest >= 15, `round ${i + 1}: ΔE ${closest}`);
      checked += 1;
      if (closest >= MIN_DELTA_E) clear += 1;
    }
  }
  assert.ok(clear / checked >= 0.95, `${clear} of ${checked}`);
});

test("saturationBand splits at 15 and 40", () => {
  assert.equal(saturationBand(14), "neutral");
  assert.equal(saturationBand(15), "soft");
  assert.equal(saturationBand(39), "soft");
  assert.equal(saturationBand(40), "vivid");
});

test("colors keep RECENT_DELTA_E from the newest recent colors almost always", () => {
  const rng = seededRng(21);
  let checked = 0;
  let clear = 0;
  for (let n = 0; n < 500; n++) {
    const recent = drawColors(NEWEST_COUNT, rng);
    for (const c of drawColors(4, rng, recent)) {
      checked += 1;
      if (Math.min(...recent.map((r) => de(c, r))) >= RECENT_DELTA_E) clear += 1;
    }
  }
  assert.ok(clear / checked >= 0.9, `${clear} of ${checked}`);
});

test("colors keep OLDER_DELTA_E from the older recent colors almost always", () => {
  const rng = seededRng(22);
  let checked = 0;
  let clear = 0;
  for (let n = 0; n < 500; n++) {
    const older = [...drawColors(24, rng), ...drawColors(24, rng)];
    const recent = [...older, ...drawColors(NEWEST_COUNT, rng)];
    for (const c of drawColors(4, rng, recent)) {
      checked += 1;
      if (Math.min(...older.map((r) => de(c, r))) >= OLDER_DELTA_E) clear += 1;
    }
  }
  assert.ok(clear / checked >= 0.85, `${clear} of ${checked}`);
});

test("when the recent colors leave no room, drawColors still returns valid colors and keeps the farthest", () => {
  const rng = seededRng(33);
  const crowded = Array.from({ length: 600 }, () => ({
    h: Math.floor(rng() * 360),
    s: Math.floor(rng() * 101),
    b: 15 + Math.floor(rng() * 81),
  }));
  const meanDistance = (colors: typeof crowded) =>
    colors.reduce((sum, c) => sum + Math.min(...crowded.map((r) => de(c, r))), 0) / colors.length;
  const drawn = Array.from({ length: 60 }, () => drawColors(1, rng, crowded)[0]);
  const plain = Array.from({ length: 60 }, () => drawColors(1, rng)[0]);
  for (const c of drawn) assert.ok(c.h >= 0 && c.h <= 359 && c.b >= 15 && c.b <= 95);
  assert.ok(meanDistance(drawn) > meanDistance(plain));
});
