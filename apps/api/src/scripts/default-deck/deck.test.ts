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

test("pickTrack matches a title whose parenthetical part is on either side", () => {
  const sat: Candidate = {
    title: "(I Can't Get No) Satisfaction",
    artists: ["The Rolling Stones"],
    year: 1965,
    br: false,
  };
  assert.equal(
    pickTrack(sat, [hit(11, "(I Can't Get No) Satisfaction", "The Rolling Stones")])?.id,
    11,
  );
  assert.equal(pickTrack(sat, [hit(12, "Satisfaction", "The Rolling Stones")])?.id, 12);
});

test("pickTrack ignores dots, apostrophes and a leading The in the artist", () => {
  const ymca: Candidate = { title: "Y.M.C.A.", artists: ["Village People"], year: 1978, br: false };
  assert.equal(pickTrack(ymca, [hit(21, "YMCA", "Village People")])?.id, 21);
  const abc: Candidate = { title: "ABC", artists: ["The Jackson 5"], year: 1970, br: false };
  assert.equal(pickTrack(abc, [hit(22, "ABC", "Jackson 5")])?.id, 22);
});

test("pickTrack takes a live recording only for a Brazilian song without a studio one", () => {
  const infiel: Candidate = {
    title: "Infiel",
    artists: ["Marília Mendonça"],
    year: 2016,
    br: true,
  };
  const live = hit(31, "Infiel (Ao Vivo)", "Marília Mendonça");
  assert.equal(pickTrack(infiel, [live])?.id, 31);
  assert.equal(pickTrack(infiel, [live, hit(32, "Infiel", "Marília Mendonça")])?.id, 32);
  assert.equal(pickTrack({ ...infiel, br: false }, [live]), null);
  assert.equal(pickTrack(infiel, [hit(33, "Infiel (Acústico)", "Marília Mendonça")]), null);
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
  const track = {
    id: 3,
    isrc: "GBUM71029604",
    preview: "https://x/p.mp3",
    title: "Bohemian Rhapsody",
  };
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
    trackTitle: `T${br ? "b" : "i"}${i}`,
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

test("select trims a side evenly along the list, so later decades are not cut", () => {
  const deck = select(accepted(8, false), 4);
  assert.deepEqual(
    deck.map((s) => s.title),
    ["Ti0", "Ti2", "Ti4", "Ti6"],
  );
});

test("select drops a repeated title and artist", () => {
  const twice = [...accepted(3, false), ...accepted(1, false)];
  assert.equal(select(twice, 10).length, 3);
  const [a, b] = accepted(2, false) as Extract<Outcome, { kind: "accepted" }>[];
  a.candidate = { ...a.candidate, title: "One Kiss", artists: ["Calvin Harris", "Dua Lipa"] };
  b.candidate = { ...b.candidate, title: "One Kiss", artists: ["Dua Lipa", "Calvin Harris"] };
  assert.equal(select([a, b], 10).length, 1);
});

test("report lists the Brazilian songs that went in as a live recording", () => {
  const infiel: Candidate = {
    title: "Infiel",
    artists: ["Marília Mendonça"],
    year: 2016,
    br: true,
  };
  const live = decide(
    infiel,
    { id: 31, isrc: "BRX", preview: "p", title: "Infiel (Ao Vivo)" },
    2016,
  );
  const studio = decide(
    queen,
    { id: 3, isrc: "GBX", preview: "p", title: "Bohemian Rhapsody" },
    1975,
  );
  const md = report([live, studio], 2);
  assert.match(md, /## Live recordings/);
  assert.match(md, /- Infiel · Marília Mendonça: Infiel \(Ao Vivo\)/);
  assert.doesNotMatch(md, /- Bohemian Rhapsody · Queen: Bohemian Rhapsody/);
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
  assert.match(md, /Ti0 · A: list 1990, MusicBrainz 2001/);
});
