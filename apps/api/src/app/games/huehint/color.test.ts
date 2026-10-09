import assert from "node:assert/strict";
import { test } from "node:test";
import { type Lab, deltaE2000, hsbToLab, lchToHsb, scoreFromDeltaE, scoreGuess } from "./color.js";

// Sharma, Wu and Dalal (2005), "The CIEDE2000 color-difference formula", test data.
const SHARMA: [Lab, Lab, number][] = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
];

test("deltaE2000 matches the Sharma reference pairs to 4 decimals", () => {
  for (const [a, b, expected] of SHARMA) {
    assert.equal(deltaE2000(a, b).toFixed(4), expected.toFixed(4), JSON.stringify([a, b]));
    assert.equal(deltaE2000(b, a).toFixed(4), expected.toFixed(4), "symmetric");
  }
});

test("hsbToLab maps white and black to the ends of the L axis", () => {
  const [L, a, b] = hsbToLab({ h: 0, s: 0, b: 100 });
  assert.ok(Math.abs(L - 100) < 0.01 && Math.abs(a) < 0.01 && Math.abs(b) < 0.01);
  assert.deepEqual(
    hsbToLab({ h: 200, s: 50, b: 0 }).map((v) => Math.round(v * 100) / 100),
    [0, 0, 0],
  );
});

test("scoreFromDeltaE follows 10·exp(-(dE/25)²) in hundredths", () => {
  assert.equal(scoreFromDeltaE(0), 1000);
  assert.equal(scoreFromDeltaE(10), 852);
  assert.equal(scoreFromDeltaE(20), 527);
  assert.equal(scoreFromDeltaE(40), 77);
});

test("scoreGuess gives 1000 for the exact color and less for a far one", () => {
  const red = { h: 355, s: 90, b: 85 };
  assert.equal(scoreGuess(red, red), 1000);
  assert.ok(scoreGuess(red, { h: 30, s: 90, b: 90 }) < 400);
});

const lchOf = (c: Parameters<typeof hsbToLab>[0]) => {
  const [L, a, b] = hsbToLab(c);
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
};
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

test("lchToHsb round-trips an in-gamut color through hsbToLab", () => {
  const back = lchOf(lchToHsb(60, 40, 30));
  assert.ok(Math.abs(back.L - 60) < 2, `L ${back.L}`);
  assert.ok(Math.abs(back.C - 40) < 3, `C ${back.C}`);
  assert.ok(hueGap(back.h, 30) < 4, `h ${back.h}`);
});

test("lchToHsb pulls an out-of-gamut color in along chroma, keeping hue and lightness", () => {
  const color = lchToHsb(90, 120, 100);
  for (const v of [color.h, color.s, color.b]) assert.ok(Number.isInteger(v));
  assert.ok(color.h >= 0 && color.h <= 359 && color.s <= 100 && color.b <= 100);
  const back = lchOf(color);
  assert.ok(back.C < 120);
  assert.ok(Math.abs(back.L - 90) < 3, `L ${back.L}`);
  assert.ok(hueGap(back.h, 100) < 6, `h ${back.h}`);
});
