// Lógica pura do baralho Taleclue (sem IO), testada em deck.test.ts.

export interface Concept {
  id: string;
  batch: number;
  scene: string;
  palette: string;
  alt: string;
  people: boolean;
  rawFile?: string;
}

export const CARD = { width: 800, height: 1200 } as const;
export const THUMB = { width: 400, height: 600 } as const;
const RATIO = 2 / 3;
const RATIO_TOLERANCE = 0.02;

export const promptOf = (c: Concept) =>
  `${c.scene} Palette: ${c.palette}.${c.people ? "" : " No people."}`;

export type SizeCheck = { ok: true } | { ok: false; reason: string };

/** Aceita 2:3 com até 2% de desvio (o crop central corrige) e pelo menos 800×1200. */
export function checkSize(width: number, height: number): SizeCheck {
  const ratio = width / height;
  if (Math.abs(ratio - RATIO) / RATIO > RATIO_TOLERANCE)
    return { ok: false, reason: `proporção ${ratio.toFixed(3)} fora de 2:3 (±2%)` };
  if (width < CARD.width || height < CARD.height)
    return {
      ok: false,
      reason: `${width}×${height} abaixo do mínimo ${CARD.width}×${CARD.height}`,
    };
  return { ok: true };
}

/** Desvio padrão de uma lista de valores 0-255. */
export function stdev(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  const mean = sum / values.length;
  let sq = 0;
  for (let i = 0; i < values.length; i++) sq += (values[i] - mean) ** 2;
  return Math.sqrt(sq / values.length);
}

/**
 * Heurística de marca visível: o canto inferior direito (onde o Gemini põe o selo)
 * tem muito mais variação que a média dos outros três cantos.
 * Cantos em ordem [superior esq., superior dir., inferior esq., inferior dir.].
 */
export function watermarkSuspect(cornerStdevs: [number, number, number, number]): boolean {
  const [tl, tr, bl, br] = cornerStdevs;
  const others = (tl + tr + bl) / 3;
  return br > 12 && br > others * 2.5;
}

/**
 * Heurística de borda/moldura: a faixa externa é quase uniforme (stdev baixo)
 * e de brilho bem diferente da faixa logo ao lado.
 */
export function borderSuspect(outerMean: number, outerStdev: number, innerMean: number): boolean {
  return outerStdev < 4 && Math.abs(outerMean - innerMean) > 25;
}
