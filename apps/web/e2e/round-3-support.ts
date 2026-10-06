import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "./support";

const UI_DIR = "/home/kaiser/KaiserInc/ResenhARK/.dev-flow/2026-10-06-rodada-3-ui-ux/ui";

export async function checkpoint(page: Page, slice: string) {
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle("dark", value === "dark");
      localStorage.setItem("theme", value);
    }, theme);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // Responsive room layouts remount the existing spring-animated card.
      await page.waitForTimeout(700);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: path.join(UI_DIR, `${slice}-${width}-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 768, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
