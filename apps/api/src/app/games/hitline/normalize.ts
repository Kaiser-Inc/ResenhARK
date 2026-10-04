function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
}

/** Lowercase, strip accents, drop version/feature noise and punctuation. */
export function normalizeTitle(text: string): string {
  return fold(text)
    .trim()
    .replace(/\s[-\u2013\u2014]\s.*$/, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[([][^)\]]*$/, "")
    .replace(/&/g, " and ")
    .replace(/\b(?:feat|ft|featuring)\b.*$/, "")
    .replace(/['\u2019`\u00b4]/g, "")
    .trim()
    .replace(/^the /, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length] as number;
}

function fuzzy(guess: string, answer: string): boolean {
  const rawA = fold(guess).trim();
  const rawB = fold(answer).trim();
  if (!rawA || !rawB) return false;
  // ponytail: answers like "!!!" or "(Intro)" normalize to empty; compare raw instead
  const a = normalizeTitle(guess) || rawA;
  const b = normalizeTitle(answer) || rawB;
  return levenshtein(a, b) <= Math.floor(b.length * 0.2);
}

export const matchesTitle = fuzzy;

export function matchesArtist(guess: string, artists: string[]): boolean {
  return artists.some((artist) => fuzzy(guess, artist));
}
