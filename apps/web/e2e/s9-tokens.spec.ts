import type { Locator, Page } from "@playwright/test";
import {
  createRoomAs,
  expect,
  importDeckAndStart,
  pokeTokens,
  startTwoPlayerGame,
  test,
} from "./support";

// The status strip comes before the scoreboard in the DOM, so .first() is the strip.
const strip = (page: Page) => page.getByTestId("token-stack").first();
const row = (page: Page, name: string) =>
  page
    .getByRole("region", { name: "Placar" })
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByTestId("token-stack");

async function expectTokens(stack: Locator, total: number) {
  await expect(stack.locator("[data-token]")).toHaveCount(Math.min(total, 5));
  await expect(stack.getByTestId("token-count")).toHaveText(
    `${total} ${total === 1 ? "ficha" : "fichas"}`,
  );
  if (total > 5) await expect(stack.getByTestId("token-more")).toHaveText(`+${total - 5}`);
  else await expect(stack.getByTestId("token-more")).toHaveCount(0);
}

test("tokens match the balance in the scoreboard and the status strip", async ({ browser }) => {
  const { code, turn, turnName } = await startTwoPlayerGame(browser);
  await expectTokens(strip(turn), 2);
  await expectTokens(row(turn, turnName), 2);
  for (const total of [7, 0]) {
    await pokeTokens(code, total);
    await turn.reload();
    await expectTokens(strip(turn), total);
    await expectTokens(row(turn, turnName), total);
  }
  await expect(strip(turn).getByTestId("token-discs")).toHaveAttribute("aria-hidden", "true");
});

test("spending a token updates the tokens at once", async ({ browser }) => {
  const { turn, other, turnName } = await startTwoPlayerGame(browser);
  await turn.getByRole("button", { name: "Puxar carta" }).click();
  await turn.getByRole("button", { name: "Sortear outra (1 ficha)" }).click();
  await expectTokens(strip(turn), 1);
  await expectTokens(row(other, turnName), 1);
});

const IDENTITY = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/;
const sample = (page: Page) =>
  page.evaluate(async () => {
    const out: string[] = [];
    for (let i = 0; i < 12; i++) {
      for (const el of document.querySelectorAll("[data-token-motion]"))
        out.push(getComputedStyle(el).transform);
      await new Promise((r) => setTimeout(r, 25));
    }
    return out;
  });

async function spendOne(page: Page) {
  await createRoomAs(page, "Ana");
  await importDeckAndStart(page, "10");
  await page.getByRole("button", { name: "Puxar carta" }).click();
  const pending = sample(page);
  await page.getByRole("button", { name: "Sortear outra (1 ficha)" }).click();
  return pending;
}

test("reduced motion: the token pop does not scale", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  const samples = await spendOne(page);
  await expectTokens(strip(page), 1);
  expect(samples.length).toBeGreaterThan(0);
  for (const t of samples) expect(t).toMatch(IDENTITY);
});

test("full motion: the token pop scales", async ({ page }) => {
  const samples = await spendOne(page);
  expect(samples.some((t) => !IDENTITY.test(t))).toBe(true);
});
