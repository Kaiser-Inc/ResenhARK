/** Lowercase, strip accents, drop version/feature noise and punctuation. */
export function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/ - .*$/, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(?:feat|ft|featuring)\b.*$/, "")
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
  const a = normalizeTitle(guess);
  const b = normalizeTitle(answer);
  if (!a || !b) return false;
  return levenshtein(a, b) <= Math.floor(b.length * 0.2);
}

export const matchesTitle = fuzzy;

export function matchesArtist(guess: string, artists: string[]): boolean {
  return artists.some((artist) => fuzzy(guess, artist));
}
