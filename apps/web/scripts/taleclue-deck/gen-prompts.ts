// Gera prompts/lote-N.md a partir de concepts.json.
// Uso: pnpm --filter web exec tsx scripts/taleclue-deck/gen-prompts.ts
import { readFileSync, writeFileSync } from "node:fs";
import { type Concept, promptOf } from "./deck.js";

const dir = new URL("./", import.meta.url);
const concepts: Concept[] = JSON.parse(readFileSync(new URL("concepts.json", dir), "utf8"));

for (const batch of [...new Set(concepts.map((c) => c.batch))]) {
  const list = concepts.filter((c) => c.batch === batch);
  const body = list
    .map(
      (c, i) =>
        `## ${String(i + 1).padStart(2, "0")} · ${c.id}${c.rawFile ? ` (já gerada: ${c.rawFile})` : ""}\n\n\`\`\`\n${promptOf(c)}\n\`\`\`\n`,
    )
    .join("\n");
  writeFileSync(
    new URL(`prompts/lote-${batch}.md`, dir),
    `# Lote ${batch}: ${list.length} prompts\n\nUse o chat com @cartas. Cole só o bloco; salve a escolhida como \`.taleclue-raw/<id>.png\` (ou .jpg).\n\n${body}`,
  );
}
console.log("prompts gerados");
