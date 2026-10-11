// Converte os PNGs/JPGs de .taleclue-raw/ em cartas webp, escreve o manifesto e a proveniência.
// Uso: pnpm --filter web exec tsx scripts/taleclue-deck/build.ts [--model "nome do modelo"]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  CARD,
  type Concept,
  THUMB,
  borderSuspect,
  checkSize,
  promptOf,
  stdev,
  watermarkSuspect,
} from "./deck.js";

const here = new URL("./", import.meta.url);
const root = new URL("../../../../", here); // raiz do monorepo
const rawDir = new URL(".taleclue-raw/", root);
const outDir = new URL("apps/web/public/taleclue/cards/", root);
const manifestPath = new URL("packages/shared/src/taleclue-deck.json", root);
const provenancePath = new URL("provenance.json", here);

const modelArg = process.argv.indexOf("--model");
const MODEL = modelArg > 0 ? process.argv[modelArg + 1] : "Gemini app, Nano Banana Pro (@cartas)";

interface Provenance {
  prompt: string;
  batch: number;
  model: string;
  date: string;
  approved: boolean;
}

const readJson = <T>(url: URL, fallback: T): T =>
  existsSync(url) ? (JSON.parse(readFileSync(url, "utf8")) as T) : fallback;

/** Procura <id>.{png,jpg,jpeg,webp} e, se houver, o arquivo indicado em rawFile (relativo a .taleclue-raw/). */
function findSource(c: Concept): string | null {
  const names = [c.id, c.rawFile].filter(Boolean) as string[];
  for (const name of names)
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const url = new URL(`${name}.${ext}`, rawDir);
      if (existsSync(url)) return fileURLToPath(url);
    }
  return null;
}

/** Desvio padrão (0-255) de um retângulo da imagem em escala de cinza, em pixels da imagem inteira. */
async function regionStdev(
  src: string,
  w: number,
  h: number,
  box: [number, number, number, number],
) {
  const [left, top, width, height] = box;
  const { data } = await sharp(src)
    .resize(w, h, { fit: "fill" })
    .greyscale()
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const v of data) sum += v;
  return { stdev: stdev(data), mean: sum / data.length };
}

/** Avisos heurísticos: não substituem a revisão visual. */
async function suspicions(src: string): Promise<string[]> {
  const W = 200;
  const H = 300;
  const cw = 24; // canto de ~12% × 8%
  const ch = 24;
  const corners = await Promise.all(
    (
      [
        [0, 0],
        [W - cw, 0],
        [0, H - ch],
        [W - cw, H - ch],
      ] as const
    ).map(([x, y]) => regionStdev(src, W, H, [x, y, cw, ch])),
  );
  const out: string[] = [];
  if (watermarkSuspect(corners.map((c) => c.stdev) as [number, number, number, number]))
    out.push("possível marca no canto inferior direito");
  const edge = await regionStdev(src, W, H, [0, 0, W, 3]); // faixa superior de 1%
  const inner = await regionStdev(src, W, H, [0, 6, W, 3]);
  const left = await regionStdev(src, W, H, [0, 0, 3, H]);
  const leftInner = await regionStdev(src, W, H, [6, 0, 3, H]);
  if (
    borderSuspect(edge.mean, edge.stdev, inner.mean) ||
    borderSuspect(left.mean, left.stdev, leftInner.mean)
  )
    out.push("possível borda ou moldura uniforme");
  return out;
}

async function main() {
  const concepts = readJson<Concept[]>(new URL("concepts.json", here), []);
  const provenance = readJson<Record<string, Provenance>>(provenancePath, {});
  mkdirSync(fileURLToPath(outDir), { recursive: true });

  const missing: Concept[] = [];
  const invalid: string[] = [];
  const warnings: string[] = [];
  let built = 0;

  for (const c of concepts) {
    const src = findSource(c);
    if (!src) {
      missing.push(c);
      continue;
    }
    const meta = await sharp(src).metadata();
    const size = checkSize(meta.width ?? 0, meta.height ?? 0);
    if (!size.ok) {
      invalid.push(`${c.id}: ${size.reason}`);
      continue;
    }
    for (const w of await suspicions(src)) warnings.push(`${c.id}: ${w}`);

    const card = (s: { width: number; height: number }, q: number) =>
      sharp(src)
        .resize(s.width, s.height, { fit: "cover", position: "centre" })
        .webp({ quality: q });
    await card(CARD, 82).toFile(fileURLToPath(new URL(`${c.id}.webp`, outDir)));
    await card(THUMB, 78).toFile(fileURLToPath(new URL(`${c.id}.thumb.webp`, outDir)));
    built++;

    // Data e aprovação ficam como estão se a carta já tinha registro; edite provenance.json para reprovar.
    provenance[c.id] = {
      prompt: promptOf(c),
      batch: c.batch,
      model: provenance[c.id]?.model ?? MODEL,
      date: provenance[c.id]?.date ?? new Date().toISOString().slice(0, 10),
      approved: provenance[c.id]?.approved ?? true,
    };
  }

  const deck = concepts
    .filter((c) => provenance[c.id]?.approved && existsSync(new URL(`${c.id}.webp`, outDir)))
    .map(({ id, alt, batch }) => ({ id, alt, batch }));
  writeFileSync(manifestPath, `${JSON.stringify(deck, null, 2)}\n`);
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

  console.log(`${built} cartas convertidas, ${deck.length} no manifesto de ${concepts.length}.`);
  for (const b of [...new Set(concepts.map((c) => c.batch))]) {
    const n = concepts.filter((c) => c.batch === b).length;
    const miss = missing.filter((c) => c.batch === b);
    console.log(
      `  lote ${b}: ${n - miss.length}/${n}${miss.length ? ` (faltam ${miss.length})` : ""}`,
    );
  }
  if (invalid.length) console.log(`\nINVÁLIDAS (não convertidas):\n  ${invalid.join("\n  ")}`);
  if (warnings.length)
    console.log(`\nAVISOS (heurística, confira a imagem):\n  ${warnings.join("\n  ")}`);
  if (missing.length && missing.length <= 30)
    console.log(`\nSem imagem: ${missing.map((c) => c.id).join(" ")}`);
  if (invalid.length) process.exit(1);
}

main();
