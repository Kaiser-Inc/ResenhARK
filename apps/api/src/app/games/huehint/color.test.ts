import assert from "node:assert/strict";
import { test } from "node:test";
import { type Lab, deltaE2000, hsbToLab, scoreFromDeltaE, scoreGuess } from "./color.js";

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
