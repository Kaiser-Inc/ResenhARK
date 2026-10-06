import assert from "node:assert/strict";
import { test } from "node:test";
import { type Candidate, type Outcome, decide, pickTrack, report, select } from "./deck.js";

const queen: Candidate = { title: "Bohemian Rhapsody", artists: ["Queen"], year: 1975, br: false };
const hit = (id: number, title: string, artist = "Queen") => ({ id, title, artist });

test("pickTrack prefers the plain studio title over remasters and rejects live, remix, karaoke and covers", () => {
  const hits = [
    hit(1, "Bohemian Rhapsody (Live Aid)"),
    hit(2, "Bohemian Rhapsody - Remastered 2011"),
    hit(3, "Bohemian Rhapsody"),
    hit(4, "Bohemian Rhapsody (Karaoke Version)", "Queen"),
  ];
  assert.equal(pickTrack(queen, hits)?.id, 3);
  assert.equal(pickTrack(queen, hits.slice(0, 2))?.id, 2);
  assert.equal(pickTrack(queen, [hit(1, "Bohemian Rhapsody (Live Aid)")]), null);
  assert.equal(pickTrack(queen, [hit(5, "Bohemian Rhapsody", "Karaoke Kings")]), null);
  assert.equal(pickTrack(queen, [hit(6, "Bohemian Rhapsody - Remix")]), null);
  const coverMe: Candidate = {
    title: "Cover Me",
    artists: ["Bruce Springsteen"],
    year: 1984,
    br: false,
  };
  assert.equal(pickTrack(coverMe, [hit(8, "Cover Me", "Bruce Springsteen")])?.id, 8);
});

test("pickTrack ignores accents, case and a featured artist", () => {
  const cand: Candidate = {
    title: "Evidências",
    artists: ["Chitãozinho & Xororó"],
    year: 1990,
    br: true,
  };
  assert.equal(pickTrack(cand, [hit(9, "Evidencias", "Chitaozinho & Xororo")])?.id, 9);
  const feat: Candidate = {
    title: "Despacito",
    artists: ["Luis Fonsi", "Daddy Yankee"],
    year: 2017,
    br: false,
  };
  assert.equal(pickTrack(feat, [hit(7, "Despacito (feat. Daddy Yankee)", "Luis Fonsi")])?.id, 7);
});

test("decide removes a song without a track, a clip or an ISRC and flags a year off by more than one", () => {
  const track = { id: 3, isrc: "GBUM71029604", preview: "https://x/p.mp3" };
  assert.deepEqual(decide(queen, null, null), {
    kind: "removed",
    candidate: queen,
    reason: "no-track",
  });
  assert.equal(
    (decide(queen, { ...track, preview: "" }, null) as { reason: string }).reason,
    "no-preview",
  );
  assert.equal(
    (decide(queen, { ...track, isrc: "" }, null) as { reason: string }).reason,
    "no-isrc",
  );
  const ok = decide(queen, track, 1976);
  assert.equal(ok.kind, "accepted");
  assert.equal(ok.kind === "accepted" && ok.divergent, false);
  const off = decide(queen, track, 2011);
  assert.equal(off.kind === "accepted" && off.divergent, true);
  const unknown = decide(queen, track, null);
  assert.equal(unknown.kind === "accepted" && unknown.divergent, false);
});

const accepted = (n: number, br: boolean): Outcome[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: "accepted",
    candidate: { title: `T${br ? "b" : "i"}${i}`, artists: ["A"], year: 1990, br },
    deezerId: i + 1,
    isrc: `X${i}`,
    mbYear: 1990,
    divergent: false,
  }));

test("select caps the deck at max with a quarter of Brazilian songs, filling from the other side when one runs short", () => {
  const deck = select([...accepted(100, false), ...accepted(40, true)], 80);
  assert.equal(deck.length, 80);
  assert.equal(deck.filter((s) => s.br).length, 20);
  const short = select([...accepted(100, false), ...accepted(5, true)], 80);
  assert.equal(short.length, 80);
  assert.equal(short.filter((s) => s.br).length, 5);
  assert.deepEqual(Object.keys(deck[0]).sort(), [
    "artists",
    "br",
    "deezerId",
    "isrc",
    "title",
    "year",
  ]);
});

test("select drops a repeated title and artist", () => {
  const twice = [...accepted(3, false), ...accepted(1, false)];
  assert.equal(select(twice, 10).length, 3);
});

test("report lists every removed song with its reason and every divergent year", () => {
  const outcomes: Outcome[] = [
    { kind: "removed", candidate: queen, reason: "no-preview" },
    {
      ...(accepted(1, false)[0] as Extract<Outcome, { kind: "accepted" }>),
      mbYear: 2001,
      divergent: true,
    },
  ];
  const md = report(outcomes, 1);
  assert.match(md, /Bohemian Rhapsody · Queen \(1975\): no-preview/);
  assert.match(md, /Ti0 · A: lista 1990, MusicBrainz 2001/);
});
