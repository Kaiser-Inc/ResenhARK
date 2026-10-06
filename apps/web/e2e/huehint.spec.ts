import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { chooseOption, createRoomAs, expect, joinRoomAs, test } from "./support";

async function checkAxe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

async function configureHuehint(page: Page) {
  await chooseOption(page, "Jogo da sala", "Huehint");
  await expect(page.getByLabel("Link da playlist")).toHaveCount(0);
  await chooseOption(page, "Voltas por jogador", "1");
  await expect(page.getByRole("button", { name: "Iniciar partida" })).toBeEnabled();
}

/** Reach the sliders and confirmation by keyboard; no pointer interaction with the selector. */
async function keyboardGuess(page: Page) {
  const hue = page.getByRole("slider", { name: "Matiz", exact: true });
  await expect(hue).toBeVisible();
  await hue.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(hue).toHaveAttribute("aria-valuenow", "11");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowUp");
  await expect(hue).toHaveAttribute("aria-valuenow", "359");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(hue).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("Tab");
  const saturation = page.getByRole("slider", { name: "Saturação", exact: true });
  await expect(saturation).toBeFocused();
  await page.keyboard.press("End");
  await expect(saturation).toHaveAttribute("aria-valuenow", "100");
  await page.keyboard.press("Tab");
  const brightness = page.getByRole("slider", { name: "Brilho", exact: true });
  await expect(brightness).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Confirmar palpite" })).toBeFocused();
  await page.keyboard.press("Enter");
}

async function giverAmong(pages: Page[]) {
  await expect
    .poll(async () => {
      for (let i = 0; i < pages.length; i++)
        if (await pages[i].getByLabel("Sua dica", { exact: true }).isVisible()) return i;
      return -1;
    })
    .toBeGreaterThanOrEqual(0);
  for (const page of pages)
    if (await page.getByLabel("Sua dica", { exact: true }).isVisible()) return page;
  throw new Error("No giver received the hint screen");
}

test("Huehint group: private target, three contexts, keyboard guesses, reconnect, scores and final gallery", async ({
  browser,
  page,
}) => {
  test.setTimeout(160_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const code = await createRoomAs(page, "Ana");
  const { page: bia } = await joinRoomAs(browser, code, "Bia");
  const { page: caio } = await joinRoomAs(browser, code, "Caio");
  const pages = [page, bia, caio];
  await configureHuehint(page);
  await expect(bia.getByText("Jogo escolhido: Huehint")).toBeVisible();
  await expect(bia.getByText("Voltas por jogador")).toBeVisible();
  await expect(bia.getByRole("combobox")).toHaveCount(0);
  await checkAxe(page);
  await checkAxe(bia);
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  for (let round = 1; round <= 3; round++) {
    const giver = await giverAmong(pages);
    const guessers = pages.filter((p) => p !== giver);
    await expect(giver.getByRole("region", { name: "Cor secreta" })).toBeVisible();
    for (const guesser of guessers) {
      await expect(guesser.getByRole("region", { name: "Cor secreta" })).toHaveCount(0);
      await expect(guesser.getByRole("slider")).toHaveCount(0);
      await expect(guesser.getByText(/está pensando na dica/).last()).toBeVisible();
    }
    if (round === 1) {
      const secret = await giver
        .getByRole("region", { name: "Cor secreta" })
        .getByRole("img")
        .getAttribute("aria-label");
      await giver.reload();
      await expect(
        giver.getByRole("region", { name: "Cor secreta" }).getByRole("img"),
      ).toHaveAttribute("aria-label", secret as string);
      await giver.getByLabel("Sua dica", { exact: true }).fill("azul 123");
      await expect(giver.getByRole("button", { name: "Enviar dica" })).toBeDisabled();
      await expect(giver.getByRole("alert")).toContainText("Essa dica não vale");
    }
    await giver.getByLabel("Sua dica", { exact: true }).fill("Vermelho McQueen");
    await giver.getByRole("button", { name: "Enviar dica" }).click();
    await expect(giver.getByRole("region", { name: "Palpites enviados" })).toBeVisible();
    await expect(giver.getByRole("slider")).toHaveCount(0);
    await expect(guessers[0].getByRole("slider")).toHaveCount(3);
    if (round === 1) {
      await checkAxe(giver);
      await checkAxe(guessers[0]);
      for (const theme of ["dark", "light"]) {
        await guessers[0].evaluate((value) => localStorage.setItem("theme", value), theme);
        await guessers[0].reload();
        await expect(guessers[0].getByRole("slider")).toHaveCount(3);
        for (const width of [390, 1440]) {
          await guessers[0].setViewportSize({ width, height: 900 });
          await checkAxe(guessers[0]);
          expect(
            await guessers[0].evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true);
          await guessers[0].screenshot({
            path: `/tmp/resenhark-huehint-${theme}-${width}.png`,
            fullPage: true,
            animations: "disabled",
          });
        }
      }
    }
    await keyboardGuess(guessers[0]);
    await expect(
      guessers[0].getByRole("region", { name: "Seu palpite", exact: true }),
    ).toContainText("Aguardando os outros");
    await expect(giver.getByRole("region", { name: "Palpites enviados" })).toContainText("enviou");
    if (round === 1) {
      await guessers[0].reload();
      await expect(
        guessers[0].getByRole("region", { name: "Seu palpite", exact: true }),
      ).toContainText("H 0° · S 100% · B 100%");
      await expect(guessers[0].getByRole("slider")).toHaveCount(0);
      await expect(guessers[0].getByRole("region", { name: "Cor secreta" })).toHaveCount(0);
    }
    await keyboardGuess(guessers[1]);
    for (const p of pages) {
      const reveal = p
        .getByRole("region", { name: `Revelação da rodada ${round}`, exact: true })
        .first();
      await expect(reveal).toBeVisible();
      await expect(reveal).toContainText("Cor real");
      await expect(reveal).toContainText(/Nota: \d+,\d{2} \/ 10,00/);
      await expect(reveal).toContainText("Nota do dador");
      await expect(reveal.getByRole("img")).toHaveCount(3);
      await expect(p.getByRole("region", { name: "Cor secreta" })).toHaveCount(0);
    }
    if (round === 1) await checkAxe(page);
  }
  for (const p of pages) {
    await expect(p.getByRole("region", { name: "Resultado" })).toBeVisible({ timeout: 20_000 });
    await expect(p.getByRole("region", { name: "Resultado" })).toContainText(/venceu|venceram/);
    await expect(p.getByRole("region", { name: "Placar final" })).toContainText("Palpites:");
    await expect(p.getByRole("region", { name: "Placar final" })).toContainText("Dicas:");
    await expect(
      p.getByRole("region", { name: "Galeria de rodadas" }).locator("details"),
    ).toHaveCount(3);
  }
  await checkAxe(page);
  await page.getByRole("button", { name: "Outra rodada" }).click();
  await expect(page.getByRole("region", { name: "Lobby" })).toBeVisible();
  await expect(page.getByLabel("Link da playlist")).toHaveCount(0);
  await chooseOption(page, "Jogo da sala", "Hitline");
  await expect(page.getByLabel("Link da playlist")).toBeVisible();
});

test("Huehint solo: memorize for three seconds, keyboard recreation, immediate reveal and five-round result", async ({
  page,
}) => {
  test.setTimeout(160_000);
  await createRoomAs(page, "Ana");
  await configureHuehint(page);
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  for (let round = 1; round <= 5; round++) {
    await expect(page.getByRole("region", { name: "Cor secreta" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("slider")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Cor secreta" })).toHaveCount(0, {
      timeout: 5_000,
    });
    await expect(page.getByText("Recrie a cor de memória", { exact: true })).toBeVisible();
    if (round === 1) await checkAxe(page);
    await keyboardGuess(page);
    const reveal = page
      .getByRole("region", { name: `Revelação da rodada ${round}`, exact: true })
      .first();
    await expect(reveal).toBeVisible();
    await expect(reveal).toContainText(/Nota: \d+,\d{2}/);
    await expect(reveal).not.toContainText("Nota do dador");
  }
  await expect(page.getByRole("region", { name: "Placar final" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Resultado" })).toContainText("Ana venceu!");
  await expect(
    page.getByRole("region", { name: "Galeria de rodadas" }).locator("details"),
  ).toHaveCount(5);
  await page.getByRole("region", { name: "Galeria de rodadas" }).locator("summary").first().click();
  await checkAxe(page);
});

test("Huehint spectator has no target or selector and owner can end the game", async ({
  browser,
  page,
}) => {
  const code = await createRoomAs(page, "Ana");
  await joinRoomAs(browser, code, "Bia");
  await configureHuehint(page);
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  await expect(page.getByRole("region", { name: "Huehint", exact: true })).toBeVisible();
  const { page: spectator } = await joinRoomAs(browser, code, "Caio");
  await expect(
    spectator.getByText("Você está assistindo. Entra na próxima partida.", { exact: true }),
  ).toBeVisible();
  await expect(spectator.getByRole("region", { name: "Cor secreta" })).toHaveCount(0);
  await expect(spectator.getByRole("slider")).toHaveCount(0);
  await page.getByRole("button", { name: "Encerrar partida" }).click();
  await page.getByRole("button", { name: "Encerrar", exact: true }).click();
  await expect(spectator.getByRole("region", { name: "Resultado" })).toContainText(
    "Partida encerrada",
  );
  await checkAxe(spectator);
});
