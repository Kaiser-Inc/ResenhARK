import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CatalogEntry,
  type PlaylistTrack,
  catalogReport,
  mergeCatalog,
  newCandidates,
  resolveGenre,
  resolveYear,
} from "./catalog-build.js";

const track = (id: number, over: Partial<PlaylistTrack> = {}): PlaylistTrack => ({
  id,
  title_short: `Song ${id}`,
  isrc: `BRXXX26${String(id).padStart(5, "0")}`,
  rank: 500_000,
  preview: "https://cdn/p.mp3",
  artist: { name: "Artist" },
  album: { id: id * 10 },
  ...over,
});
const entry = (deezerId: number, over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: `cat-${deezerId}`,
  deezerId,
  isrc: `BRXXX26${String(deezerId).padStart(5, "0")}`,
  title: `Song ${deezerId}`,
  artists: ["Artist"],
  year: 2001,
  genre: 132,
  rank: 500_000,
  yearVerified: true,
  ...over,
});

test("newCandidates drops tracks without clip, ISRC or enough rank, repeats and known ISRCs", () => {
  const tracks = [
    track(1),
    track(2, { preview: "" }),
    track(3, { isrc: undefined }),
    track(4, { rank: 299_999 }),
    track(5, { isrc: track(1).isrc }), // same recording as 1
    track(6),
  ];
  const known = new Set([track(6).isrc as string]);
  assert.deepEqual(
    newCandidates(tracks, 300_000, known).map((t) => t.id),
    [1],
  );
});

test("resolveYear takes the earlier of MusicBrainz and Deezer and flags unverified years", () => {
  assert.deepEqual(resolveYear("2007-11-20", 1987), { year: 1987, verified: true });
  assert.deepEqual(resolveYear("1987-03-09", 1990), { year: 1987, verified: true });
  assert.deepEqual(resolveYear("2016-11-25", null), { year: 2016, verified: false });
  assert.deepEqual(resolveYear(undefined, 1961), { year: 1961, verified: true });
  assert.equal(resolveYear(undefined, null), null);
  assert.equal(resolveYear("0000-00-00", null), null);
});

test("resolveGenre keeps allowed album genres and sends the rest to Outros", () => {
  assert.equal(resolveGenre(80), 80);
  assert.equal(resolveGenre(95), -1); // Infantil is not played
  assert.equal(resolveGenre(-1), -1);
  assert.equal(resolveGenre(undefined), -1);
});

test("mergeCatalog keeps every existing song, adds only new ISRCs and sorts by Deezer id", () => {
  const existing = [entry(30), entry(10)];
  const merged = mergeCatalog(existing, [entry(20), entry(99, { isrc: entry(10).isrc })]);
  assert.deepEqual(
    merged.map((e) => e.deezerId),
    [10, 20, 30],
  );
});

test("catalogReport lists counts by genre and decade and the unverified years", () => {
  const md = catalogReport(
    [entry(1), entry(2, { genre: 80, year: 1975, yearVerified: false })],
    [entry(2, { genre: 80, year: 1975, yearVerified: false })],
    7,
  );
  assert.match(md, /Total: 2/);
  assert.match(md, /Novas nesta execução: 1/);
  assert.match(md, /Descartadas pelo corte: 7/);
  assert.match(md, /\| Sertanejo \| 1 \|/);
  assert.match(md, /\| Anos 70 \| 1 \|/);
  assert.match(md, /Song 2/);
});
