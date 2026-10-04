import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type Page, expect } from "@playwright/test";

export const UI_DIR = path.resolve(
  __dirname,
  "../../../.dev-flow/2026-10-04-rodada-1-sala-chat-hitline/ui",
);

export async function setTheme(page: Page, theme: "dark" | "light") {
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
}

export async function shot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({
    path: path.join(UI_DIR, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

export async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}
