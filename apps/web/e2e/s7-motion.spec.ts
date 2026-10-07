import type { Page } from "@playwright/test";
import { createRoomAs, expect, importDeckAndStart, peekDraw, test } from "./support";

/** Solo game up to the lock button: draws, picks the gap that makes the card a hit (or a miss). */
async function playToLock(page: Page, code: string, hit = true) {
  await page.getByRole("button", { name: "Puxar carta" }).click();
  const card = await peekDraw(code);
  const starter = Number(
    (await page.getByRole("list", { name: /^Timeline de / }).innerText()).match(/\d{4}/)?.[0],
  );
  const gaps = page.getByRole("button", { name: /Inserir/ });
  await expect(gaps).toHaveCount(2);
  await expect(gaps.first()).toBeEnabled();
  const after = card.year >= starter;
  await gaps.nth(after === hit ? 1 : 0).click();
  await page.getByLabel("Música").fill(card.title);
  await page.getByLabel("Artista").fill(card.artists[0]);
  return page.getByRole("button", { name: "Travar palpite" });
}

const IDENTITY = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/;

/** Samples the transform of every [data-motion] node for 700 ms, every 50 ms. */
const sample = (page: Page) =>
  page.evaluate(async () => {
    const out: string[] = [];
    for (let i = 0; i < 14; i++) {
      for (const el of document.querySelectorAll("[data-motion]"))
        out.push(getComputedStyle(el).transform);
      await new Promise((r) => setTimeout(r, 50));
    }
    return out;
  });

test("immersive motion: reveal still rotates with a reduced system preference", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const code = await createRoomAs(page, "Ana");
  await importDeckAndStart(page);
  const lock = await playToLock(page, code);
  const pending = sample(page);
  await lock.click();
  const samples = await pending;
  await expect(page.getByRole("region", { name: "Virada" })).toBeVisible();
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.some((t) => !IDENTITY.test(t))).toBe(true);
  await expect(page.locator("[data-expression]").first()).toBeVisible();
  // The full reveal still settles on the actual year and outcome.
  const reveal = page.getByRole("region", { name: "Virada" });
  const year = (await reveal.locator(".sr-only").first().innerText()).trim();
  await expect
    .poll(() =>
      reveal.getByTestId("odometer").evaluate((node) =>
        Array.from(node.children)
          .map((column) => {
            const bounds = column.getBoundingClientRect();
            return Array.from(column.firstElementChild?.children ?? []).find((digit) => {
              const box = digit.getBoundingClientRect();
              const center = box.top + box.height / 2;
              return center >= bounds.top && center < bounds.bottom;
            })?.textContent;
          })
          .join(""),
      ),
    )
    .toBe(year);
  await expect(reveal.getByText(/^[✓✗]$/)).toBeVisible();
  await expect
    .poll(() =>
      reveal
        .locator('[data-motion="reveal-card"]')
        .evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m11),
    )
    .toBeCloseTo(-1, 3);
  await expect(reveal.getByText("?", { exact: true })).toHaveCSS("backface-visibility", "hidden");
});

test("full motion: reveal rotates the card", async ({ page }) => {
  const code = await createRoomAs(page, "Ana");
  await importDeckAndStart(page);
  const lock = await playToLock(page, code);
  const pending = sample(page);
  await lock.click();
  const samples = await pending;
  expect(samples.some((t) => !IDENTITY.test(t))).toBe(true);
  await expect(page.getByRole("region", { name: "Virada" })).toContainText(/\d{4}/);
});

test("winner sees confetti canvas and love expression", async ({ page }) => {
  const code = await createRoomAs(page, "Ana");
  await importDeckAndStart(page, "2");
  const lock = await playToLock(page, code);
  await lock.click();
  const result = page.getByRole("region", { name: "Resultado" });
  await expect(result).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(result.locator('[data-expression="love"]')).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Placar" }).locator('[data-expression="love"]'),
  ).toHaveCount(1);
});

test("immersive motion: victory keeps confetti with a reduced system preference", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const code = await createRoomAs(page, "Ana");
  await importDeckAndStart(page, "2");
  const lock = await playToLock(page, code);
  await lock.click();
  await expect(page.getByRole("region", { name: "Resultado" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("blobatar expression follows the game: thinking, then happy on a hit", async ({ page }) => {
  const code = await createRoomAs(page, "Ana");
  await importDeckAndStart(page, "10");
  const lock = await playToLock(page, code);
  await expect(page.locator('[data-expression="thinking"]').first()).toBeVisible();
  await lock.click();
  await expect(page.getByRole("region", { name: "Virada" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Placar" }).locator('[data-expression="happy"]'),
  ).toHaveCount(1);
});
