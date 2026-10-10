import path from "node:path";
import type { Page } from "@playwright/test";
import {
  chooseOption,
  createRoomAs,
  expect,
  expectNoAxeViolations,
  joinRoomAs,
  peekRoom,
  test,
  writeRoom,
} from "./support";

const UI_DIR = path.resolve(__dirname, "../../../.dev-flow/2026-10-10-taleclue-uiux/ui");

async function narrator(pages: Page[]) {
  let result: Page | undefined;
  await expect
    .poll(async () => {
      for (const page of pages) {
        if (await page.getByLabel("Pista", { exact: true }).isVisible()) {
          result = page;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return result as Page;
}

async function selectHand(page: Page, count: number) {
  const cards = page
    .getByRole("region", { name: "Sua mão", exact: true })
    .getByRole("button", { name: /^Carta [0-9]+$/ });
  for (let i = 0; i < count; i++) await cards.nth(i).click();
}

for (const count of [3, 4]) {
  test(`Taleclue guidance: ${count} players learn their role and confirm each action`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(180000);
    const code = await createRoomAs(page, "Ana");
    const pages = [page];
    for (const name of ["Bia", "Caio", "Dani"].slice(0, count - 1))
      pages.push((await joinRoomAs(browser, code, name)).page);
    await chooseOption(page, "Jogo da sala", "Taleclue");
    await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    const giver = await narrator(pages);
    const others = pages.filter((p) => p !== giver);
    await expect(
      giver.getByRole("heading", { name: "Sua vez de dar a pista", exact: true }),
    ).toBeVisible();
    const help = giver.getByRole("button", { name: "Entenda esta fase", exact: true });
    await help.focus();
    await help.press("Enter");
    await expect(help).toHaveAttribute("aria-expanded", "true");
    await expect(
      giver.getByText(
        "Uma boa pista combina com a imagem, mas não deve ser óbvia para todo mundo.",
        { exact: true },
      ),
    ).toBeVisible();
    if (count === 3) {
      for (const theme of ["dark", "light"]) {
        await giver.evaluate(
          (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
          theme,
        );
        for (const width of [390, 1440]) {
          await giver.setViewportSize({ width, height: 900 });
          const phaseHelp = giver.getByRole("button", { name: "Entenda esta fase", exact: true });
          if ((await phaseHelp.getAttribute("aria-expanded")) !== "true") await phaseHelp.click();
          await expect(
            giver.getByText(
              "Uma boa pista combina com a imagem, mas não deve ser óbvia para todo mundo.",
              { exact: true },
            ),
          ).toBeVisible();
          await expect
            .poll(() =>
              giver
                .locator('[aria-label="Sua mão"] [data-card-id]')
                .evaluateAll((nodes) =>
                  nodes.every((node) => getComputedStyle(node).opacity === "1"),
                ),
            )
            .toBe(true);
          const hand = await giver
            .getByRole("region", { name: "Sua mão", exact: true })
            .boundingBox();
          const board = await giver
            .getByRole("region", { name: "Tabuleiro", exact: true })
            .boundingBox();
          const clue = await giver.getByLabel("Pista", { exact: true }).boundingBox();
          if (!hand || !board || !clue) throw new Error("Game geometry is unavailable");
          expect(clue.y).toBeLessThan(hand.y);
          if (width === 390) expect(hand.y).toBeLessThan(board.y);
          else expect(hand.x + hand.width).toBeLessThanOrEqual(board.x);
          expect(
            await giver.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await expectNoAxeViolations(giver);
          await giver.screenshot({
            path: path.join(UI_DIR, `fatia-1-${width}-${theme}.png`),
            fullPage: true,
          });
        }
      }
    }
    const spectator = (await joinRoomAs(browser, code, "Eva")).page;
    await expect(
      spectator.getByRole("heading", { name: "Você está acompanhando esta partida.", exact: true }),
    ).toBeVisible();
    await expect(spectator.getByRole("button", { name: "Enviar pista", exact: true })).toHaveCount(
      0,
    );
    await selectHand(giver, 1);
    await giver.getByLabel("Pista", { exact: true }).fill("Porta 42");
    await giver.getByRole("button", { name: "Enviar pista", exact: true }).click();
    for (const other of others) {
      await expect(
        other.getByRole("heading", {
          name: count === 3 ? "Escolha duas iscas" : "Escolha uma isca",
          exact: true,
        }),
      ).toBeVisible();
      await selectHand(other, count === 3 ? 2 : 1);
      await other.getByRole("button", { name: "Jogar iscas", exact: true }).click();
      if (other === others[0]) {
        await expect(
          other.getByRole("heading", {
            name: count === 3 ? "Iscas enviadas." : "Isca enviada.",
            exact: true,
          }),
        ).toBeVisible();
        await expect(other.locator("[data-urgent]")).toHaveAttribute("data-urgent", "false");
      }
    }
    for (const other of others) {
      await expect(
        other.getByRole("heading", { name: "Encontre a carta do narrador", exact: true }),
      ).toBeVisible();
      const cards = other
        .getByRole("region", { name: "Mesa", exact: true })
        .getByRole("button", { name: /^Carta [0-9]+$/ });
      for (const card of await cards.all())
        if (await card.isEnabled()) {
          await card.click();
          break;
        }
      await other.getByRole("button", { name: "Confirmar voto", exact: true }).click();
      if (other === others[0])
        await expect(
          other.getByRole("heading", { name: "Voto enviado.", exact: true }),
        ).toBeVisible();
    }
    await expect(
      giver.getByRole("region", { name: "Revelação da rodada 1", exact: true }),
    ).toBeVisible();
    await expect(giver.locator("[data-urgent]")).toHaveAttribute("data-urgent", "false");
    await giver.getByRole("button", { name: "Entenda esta fase", exact: true }).click();
    await expect(
      giver.getByText(
        "Veja a carta do narrador, os votos e os pontos. As peças avançam no tabuleiro conforme a pontuação.",
        { exact: true },
      ),
    ).toBeVisible();
    await expectNoAxeViolations(giver);
  });
}

test("Taleclue countdown: rejected clues preserve the draft and reconnect seeks urgency", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const code = await createRoomAs(page, "Ana");
  const pages = [
    page,
    (await joinRoomAs(browser, code, "Bia")).page,
    (await joinRoomAs(browser, code, "Caio")).page,
  ];
  await chooseOption(page, "Jogo da sala", "Taleclue");
  await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  const giver = await narrator(pages);
  await selectHand(giver, 1);
  await giver.getByLabel("Pista", { exact: true }).fill("Porta 42");
  const selected = await giver
    .getByRole("region", { name: "Sua mão", exact: true })
    .locator('[data-card-id]:has(button[aria-pressed="true"])')
    .getAttribute("data-card-id");
  let stored = await peekRoom(code);
  const narratorId = stored.game.state.narratorId;
  const hand = [...stored.game.state.hands[narratorId]];
  // Test-only server rejection: the selected card is absent without updating the client projection.
  stored.game.state.hands[narratorId] = hand.filter((id) => id !== selected);
  await writeRoom(code, stored);
  await giver.getByRole("button", { name: "Enviar pista", exact: true }).click();
  await expect(giver.locator("[data-sonner-toast]")).toContainText(/carta/i);
  await expect(giver.getByLabel("Pista", { exact: true })).toHaveValue("Porta 42");
  await expect(giver.getByRole("button", { name: "Enviar pista", exact: true })).toBeEnabled();
  stored = await peekRoom(code);
  stored.game.state.hands[narratorId] = hand;
  stored.game.state.deadline = Date.now() + 14000;
  await writeRoom(code, stored);
  await giver.context().setOffline(true);
  await expect(giver.getByRole("button", { name: "Enviar pista", exact: true })).toBeDisabled();
  await giver.context().setOffline(false);
  await expect(giver.getByRole("button", { name: "Enviar pista", exact: true })).toBeEnabled();
  await expect(giver.getByLabel("Pista", { exact: true })).toHaveValue("Porta 42");
  await expect(giver.locator("[data-urgent]")).toHaveAttribute("data-urgent", "true");
  expect(
    Number(await giver.locator("[data-time-fraction]").getAttribute("data-time-fraction")),
  ).toBeLessThan(0.2);
  await expect(pages.filter((p) => p !== giver)[0].locator("[data-urgent]")).toHaveAttribute(
    "data-urgent",
    "false",
  );
  for (const theme of ["dark", "light"]) {
    await giver.evaluate(
      (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    for (const width of [390, 1440]) {
      await giver.setViewportSize({ width, height: 900 });
      // Renew only this test room's public deadline so each accessibility scan has a full window.
      stored = await peekRoom(code);
      stored.game.state.deadline = Date.now() + 9500;
      await writeRoom(code, stored);
      await giver.context().setOffline(true);
      await expect(giver.getByRole("button", { name: "Enviar pista", exact: true })).toBeDisabled();
      await giver.context().setOffline(false);
      await expect(giver.getByRole("button", { name: "Enviar pista", exact: true })).toBeEnabled();
      await expect(giver.locator("[data-urgent]")).toHaveAttribute("data-urgent", "true");
      await expect(giver.getByLabel("Pista", { exact: true })).toHaveValue("Porta 42");
      await expect
        .poll(() =>
          giver
            .locator('[aria-label="Sua mão"] [data-card-id]')
            .evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).opacity === "1")),
        )
        .toBe(true);
      await expectNoAxeViolations(giver);
      await giver.screenshot({
        path: path.join(UI_DIR, `fatia-1-urgencia-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }

  await giver.getByRole("button", { name: "Enviar pista", exact: true }).click();
  await expect(
    giver.getByRole("heading", { name: "Sua pista já está na mesa.", exact: true }),
  ).toBeVisible();
  await expect(giver.locator("[data-urgent]")).toHaveAttribute("data-urgent", "false");
});
