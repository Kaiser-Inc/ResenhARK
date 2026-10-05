import path from "node:path";
import type { Page } from "@playwright/test";
import {
  UI_DIR,
  createRoomAs,
  expect,
  importDeckAndStart,
  peekDraw,
  setTheme,
  startTwoPlayerGame,
  test,
} from "./support";

// Key frames of the game motion, taken live (animations enabled) a fixed time after the trigger.
const VIEWPORTS = [
  { width: 1440, height: 900, theme: "dark" as const },
  { width: 390, height: 844, theme: "light" as const },
];

const frame = async (page: Page, name: string) => {
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: path.join(UI_DIR, `${name}.png`) });
};

for (const { width, height, theme } of VIEWPORTS) {
  const name = (screen: string) => `s7-${screen}-${width}-${theme}`;

  test(`motion frames solo ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setTheme(page, theme);
    const code = await createRoomAs(page, "Ana");
    await importDeckAndStart(page, "2");
    await page.getByRole("button", { name: "Puxar carta" }).click();
    const card = await peekDraw(code);
    const starter = Number(
      (await page.getByRole("list", { name: /^Timeline de / }).innerText()).match(/\d{4}/)?.[0],
    );
    const gaps = page.getByRole("button", { name: /Inserir/ });
    await expect(gaps.first()).toBeEnabled();
    await gaps.nth(card.year >= starter ? 1 : 0).click();
    await page.waitForTimeout(150);
    await frame(page, name("ghost-gap"));
    await page.getByLabel("Música").fill(card.title);
    await page.getByLabel("Artista").fill(card.artists[0]);
    await page.getByRole("button", { name: "Travar palpite" }).click();
    await page.waitForTimeout(110);
    await frame(page, name("flip-mid"));
    await page.waitForTimeout(150);
    await frame(page, name("odometer-mid"));
    await expect(page.getByRole("region", { name: "Resultado" })).toBeVisible();
    await page.waitForTimeout(250);
    await frame(page, name("winner"));
  });

  test(`motion frames contest ring ${width} ${theme}`, async ({ browser }) => {
    const { turn, other } = await startTwoPlayerGame(browser);
    for (const page of [turn, other]) {
      await page.setViewportSize({ width, height });
      await setTheme(page, theme);
      await page.reload();
    }
    await turn.getByRole("button", { name: "Puxar carta" }).click();
    await turn
      .getByRole("button", { name: /Inserir/ })
      .first()
      .click();
    await turn.getByRole("button", { name: "Travar palpite" }).click();
    await expect(other.getByRole("timer")).toBeVisible();
    await other.waitForTimeout(1500);
    await frame(other, name("contest-ring"));
  });
}
