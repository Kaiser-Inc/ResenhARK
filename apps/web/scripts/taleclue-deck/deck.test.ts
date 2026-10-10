import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  type Concept,
  borderSuspect,
  checkSize,
  promptOf,
  stdev,
  watermarkSuspect,
} from "./deck.js";

const concepts: Concept[] = JSON.parse(
  readFileSync(new URL("./concepts.json", import.meta.url), "utf8"),
);

test("concepts.json: 120 conceitos, 30 por lote, ids hex únicos e cenas diferentes", () => {
  assert.equal(concepts.length, 120);
  for (const b of [1, 2, 3, 4]) assert.equal(concepts.filter((c) => c.batch === b).length, 30);
  assert.equal(new Set(concepts.map((c) => c.id)).size, 120);
  assert.ok(concepts.every((c) => /^[0-9a-f]{8}$/.test(c.id)));
  assert.equal(new Set(concepts.map((c) => c.scene)).size, 120);
  assert.ok(concepts.every((c) => c.alt.length > 20 && c.palette.length > 0));
});

test("promptOf acrescenta 'No people.' só quando a cena não tem pessoas", () => {
  const base = { id: "00000000", batch: 1, scene: "A fox.", palette: "red, blue", alt: "x" };
  assert.equal(promptOf({ ...base, people: false }), "A fox. Palette: red, blue. No people.");
  assert.equal(promptOf({ ...base, people: true }), "A fox. Palette: red, blue.");
});

test("checkSize aceita 2:3 com até 2% de desvio e exige 800×1200", () => {
  assert.ok(checkSize(848, 1264).ok);
  assert.ok(checkSize(1696, 2528).ok);
  assert.ok(checkSize(800, 1200).ok);
  assert.ok(!checkSize(1024, 1024).ok);
  assert.ok(!checkSize(1200, 800).ok);
  assert.ok(!checkSize(600, 900).ok);
  assert.ok(!checkSize(900, 1200).ok);
});

test("heurísticas de marca e borda", () => {
  assert.equal(stdev([10, 10, 10]), 0);
  assert.ok(watermarkSuspect([8, 9, 7, 40]));
  assert.ok(!watermarkSuspect([8, 9, 7, 10]));
  assert.ok(!watermarkSuspect([30, 30, 30, 40]));
  assert.ok(borderSuspect(240, 1, 120));
  assert.ok(!borderSuspect(120, 20, 125));
});
