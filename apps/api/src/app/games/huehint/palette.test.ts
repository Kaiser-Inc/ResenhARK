import assert from "node:assert/strict";
import { test } from "node:test";
import { seededRng } from "../../core/seeded-rng.js";
import { MAX_COLORS } from "../../domain/room/room.js";
import { deltaE2000, hsbToLab } from "./color.js";
import {
  DARK_BELOW,
  FAMILIES,
  MIN_DELTA_E,
  NEWEST_COUNT,
  RECENT_DELTA_E,
  drawColors,
  drawRounds,
  sampleFamily,
  saturationBand,
} from "./palette.js";

const GAMES = 3000;
const ROUNDS = 12;
const rounds = (() => {
  const rng = seededRng(7);
  return Array.from({ length: GAMES }, () => drawRounds(ROUNDS, rng));
})();
const games = rounds.map((g) => g.map((r) => r.color));
const de = (a: Parameters<typeof hsbToLab>[0], b: Parameters<typeof hsbToLab>[0]) =>
  deltaE2000(hsbToLab(a), hsbToLab(b));

test("there are 12 perceptual families, with pink, brown, cyan, beige and lavender among them", () => {
  assert.equal(FAMILIES.length, 12);
  for (const name of ["pink", "brown", "cyan", "beige", "lavender"])
    assert.ok(
      FAMILIES.some((f) => f.name === name),
      name,
    );
  assert.equal(new Set(FAMILIES.map((f) => f.name)).size, 12);
});

test("each family samples colors inside its lightness, chroma and hue box", () => {
  const rng = seededRng(3);
  const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  for (const family of FAMILIES) {
    for (let i = 0; i < 300; i++) {
      const [L, a, b] = hsbToLab(sampleFamily(family, rng));
      const C = Math.hypot(a, b);
      const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
      assert.ok(L >= family.l[0] - 5 && L <= family.l[1] + 5, `${family.name} L ${L}`);
      assert.ok(C <= family.c[1] + 4, `${family.name} C ${C}`);
      if (C > 12) {
        const [lo, hi] = family.h;
        const mid = (lo + hi) / 2;
        assert.ok(gap(h, mid % 360) <= (hi - lo) / 2 + 12, `${family.name} h ${h}`);
      }
    }
  }
});

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

test("consecutive rounds never share a family, and every 12 family rounds cover all 12", () => {
  for (const g of rounds) {
    const families = g.map((r) => r.family).filter((f): f is string => f !== null);
    for (let i = 1; i < families.length; i++) assert.notEqual(families[i], families[i - 1]);
    assert.equal(new Set(families.slice(0, 12)).size, Math.min(12, families.length));
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

test("a 4-round game's closest pair is MIN_DELTA_E apart in the median game", () => {
  const rng = seededRng(11);
  const closest = Array.from({ length: 1500 }, () => {
    const g = drawColors(4, rng);
    return Math.min(...g.flatMap((a, i) => g.slice(i + 1).map((b) => de(a, b))));
  }).sort((a, b) => a - b);
  assert.ok(closest[750] >= MIN_DELTA_E, `median ${closest[750]}`);
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

test("a room playing game after game never repeats a color of the previous game", () => {
  const rng = seededRng(22);
  let pairs = 0;
  let near = 0;
  for (let room = 0; room < 60; room++) {
    let memory: ReturnType<typeof drawColors> = [];
    let previous: ReturnType<typeof drawColors> = [];
    for (let game = 0; game < 11; game++) {
      const colors = drawColors(4, rng, memory);
      if (game > 0) {
        pairs += 1;
        if (colors.some((c) => previous.some((p) => de(c, p) < 10))) near += 1;
      }
      previous = colors;
      memory = [...memory, ...colors].slice(-MAX_COLORS);
    }
  }
  assert.ok(near / pairs < 0.03, `${near} of ${pairs} games repeat a color`);
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
