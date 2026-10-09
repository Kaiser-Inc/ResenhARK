import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { HUEHINT_RANKS } from "@resenhark/shared";
import {
  chooseOption,
  createRoomAs,
  expect,
  joinRoomAs,
  peekRoom,
  test,
  writeRoom,
} from "./support";

async function checkAxe(page: Page) {
  // Scan the settled reveal; an opacity entrance temporarily lowers text contrast.
  await expect
    .poll(() =>
      page
        .locator('[data-motion^="hue-"]')
        .evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).opacity === "1")),
    )
    .toBe(true);
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
  await expect(bia.getByText("Voltas por jogador", { exact: true })).toBeVisible();
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
        .getAttribute("style");
      await giver.reload();
      await expect(
        giver.getByRole("region", { name: "Cor secreta" }).getByRole("img"),
      ).toHaveAttribute("style", secret as string);
      await giver.getByLabel("Sua dica", { exact: true }).fill("azul 123");
      await expect(giver.getByRole("button", { name: "Enviar dica" })).toBeDisabled();
      await expect(
        giver.getByRole("region", { name: "Huehint", exact: true }).getByRole("alert"),
      ).toContainText("Essa dica não vale");
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
        guessers[0].getByRole("region", { name: "Seu palpite", exact: true }).getByRole("img"),
      ).toHaveCSS("background-color", "rgb(255, 0, 0)");
      await expect(guessers[0].getByRole("slider")).toHaveCount(0);
      await expect(guessers[0].getByRole("region", { name: "Cor secreta" })).toHaveCount(0);
    }
    await keyboardGuess(guessers[1]);
    for (const p of pages) {
      const reveal = p.getByRole("region", { name: `Revelação da rodada ${round}`, exact: true });
      await expect(reveal).toBeVisible();
      await expect(reveal).toContainText("Cor real");
      await expect(reveal).toContainText(/Nota: \d+,\d{2} \/ 10,00/);
      await expect(reveal).toContainText("Nota do dador");
      await expect(reveal.getByRole("img")).toHaveCount(4);
      await expect(p.getByRole("region", { name: "Cor secreta" })).toHaveCount(0);
      await expect(
        p.getByRole("region", { name: "Huehint", exact: true }).locator('[aria-live="polite"]'),
      ).toContainText(`Rodada ${round} revelada`);
    }
    if (round === 1) await checkAxe(page);
  }
  for (const p of pages) {
    await expect(p.getByRole("region", { name: "Resultado" })).toBeVisible({ timeout: 20_000 });
    await expect(p.getByRole("region", { name: "Resultado" })).toContainText(/venceu|venceram/);
    await expect(p.getByRole("region", { name: "Resultado" })).not.toContainText("desempate");
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

test("Huehint solo: memorize for five seconds, keyboard recreation, immediate reveal and five-round result", async ({
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
      timeout: 8_000,
    });
    await expect(
      page.getByRole("paragraph").filter({ hasText: /^Recrie a cor de memória$/ }),
    ).toBeVisible();
    if (round === 1) await checkAxe(page);
    await keyboardGuess(page);
    const reveal = page.getByRole("region", { name: `Revelação da rodada ${round}`, exact: true });
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
  await expect(spectator.getByRole("region", { name: "Resultado" })).not.toContainText(
    /Rank|Vitória|venceu|meta B/,
  );
  await checkAxe(spectator);
});

test("Huehint duo: alternating givers, collective partial score and final gallery for both players", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const code = await createRoomAs(page, "Ana");
  const { page: bia } = await joinRoomAs(browser, code, "Bia");
  const pages = [page, bia];
  await configureHuehint(page);
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  let firstGiver: Page | undefined;
  for (let round = 1; round <= 2; round++) {
    const giver = await giverAmong(pages);
    const guesser = pages.find((p) => p !== giver) as Page;
    if (round === 1) firstGiver = giver;
    else expect(giver).not.toBe(firstGiver);
    for (const participant of pages) {
      const board = participant.getByRole("region", { name: "Huehint", exact: true });
      const giverName = giver === page ? "Ana" : "Bia";
      const nextName = round === 2 ? "última rodada" : giver === page ? "Bia" : "Ana";
      await expect(
        board.getByText(`Dica agora: ${giverName} · Próxima dica: ${nextName}`, { exact: true }),
      ).toBeVisible();
      const partial = participant.getByRole("region", { name: "Placar parcial" });
      await expect(partial).toContainText("Nota da dupla");
      await expect(partial).toContainText("Rank provisório:");
      await expect(partial).toContainText("B para vencer");
      await expect(partial).not.toContainText(/Palpites:|Dicas:/);
    }
    await giver.getByLabel("Sua dica", { exact: true }).fill("Vermelho McQueen");
    await giver.getByRole("button", { name: "Enviar dica" }).click();
    await keyboardGuess(guesser);
    await expect(
      page.getByRole("region", { name: `Revelação da rodada ${round}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Placar parcial" })).toContainText(
      /\d+,\d{2} \/ \d+,\d{2}/,
    );
  }
  for (const participant of pages) {
    const result = participant.getByRole("region", { name: "Resultado" });
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(result.getByLabel(/^Rank [SABCDE]$/)).toBeVisible();
    await expect(result).toContainText(/A dupla venceu|A dupla não alcançou a meta B/);
    await expect(participant.getByRole("region", { name: "Contribuições da dupla" })).toContainText(
      "Palpites:",
    );
    await expect(participant.getByRole("region", { name: "Placar final" })).toHaveCount(0);
    await expect(
      participant.getByRole("region", { name: "Galeria de rodadas" }).locator("details"),
    ).toHaveCount(2);
  }
  await checkAxe(page);
});

/** Seed revealed scores in the isolated E2E Redis; the real engine computes the ending and rank. */
async function seedHuehintFinal(code: string, scoreFor: (round: number, player: number) => number) {
  const stored = await peekRoom(code);
  const state = stored.game.state;
  state.results = state.schedule.map(
    (scheduled: { giverId: string; color: { h: number; s: number; b: number } }, index: number) => {
      const guesses = state.players
        .filter((player: { id: string }) => player.id !== scheduled.giverId)
        .map((player: { id: string }) => ({
          playerId: player.id,
          color: scheduled.color,
          score: scoreFor(
            index,
            state.players.findIndex((p: { id: string }) => p.id === player.id),
          ),
        }));
      return {
        round: index + 1,
        giverId: scheduled.giverId,
        color: scheduled.color,
        hint: "Vermelho McQueen",
        outcome: "revealed",
        guesses,
        giverScore: Math.round(
          guesses.reduce((sum: number, guess: { score: number }) => sum + guess.score, 0) /
            guesses.length,
        ),
      };
    },
  );
  state.round = state.schedule.length - 1;
  state.phase = "reveal";
  state.hint = null;
  state.guesses = [];
  state.deadline = Date.now() - 1;
  await writeRoom(code, stored);
}

for (const { rank, min } of HUEHINT_RANKS) {
  test(`Huehint duo rank ${rank}: shared outcome, contributions and accessible result in both themes`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const code = await createRoomAs(page, "Ana");
    const { page: bia } = await joinRoomAs(browser, code, "Bia");
    await configureHuehint(page);
    await page.getByRole("button", { name: "Iniciar partida" }).click();
    await expect(page.getByRole("region", { name: "Huehint", exact: true })).toBeVisible();
    await seedHuehintFinal(code, () => Math.round(min * 1000));
    const won = ["B", "A", "S"].includes(rank);
    for (const participant of [page, bia]) {
      await participant.reload();
      const result = participant.getByRole("region", { name: "Resultado" });
      await expect(result.getByLabel(`Rank ${rank}`, { exact: true })).toBeVisible();
      await expect(result).toContainText(
        won ? "Vitória dos dois!" : "A dupla não alcançou a meta B.",
      );
      await expect(result).not.toContainText(/Ana venceu|Bia venceu|desempate|Empate dividido/);
      await expect(
        participant.getByRole("region", { name: "Contribuições da dupla" }).getByRole("listitem"),
      ).toHaveCount(2);
      await expect(
        participant.getByRole("region", { name: "Galeria de rodadas" }).locator("details"),
      ).toHaveCount(2);
    }
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle("dark", value === "dark"),
        theme,
      );
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(
          page.getByRole("region", { name: "Resultado" }).getByLabel(`Rank ${rank}`),
        ).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await checkAxe(page);
        await page.screenshot({
          path: `/tmp/resenhark-r5-${rank}-${theme}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  });
}

test("Huehint duo ends without rank when a player leaves", async ({ page, browser }) => {
  const code = await createRoomAs(page, "Ana");
  const { page: bia } = await joinRoomAs(browser, code, "Bia");
  await configureHuehint(page);
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  await expect(bia.getByRole("region", { name: "Huehint", exact: true })).toBeVisible();
  await bia.getByRole("button", { name: "Sair da sala", exact: true }).click();
  await bia.getByRole("button", { name: "Sair", exact: true }).click();
  const result = page.getByRole("region", { name: "Resultado" });
  await expect(result).toContainText("Partida encerrada");
  await expect(result).toContainText("menos de 2 jogadores");
  await expect(result).not.toContainText(/Rank|Vitória|venceu|meta B/);
});

for (const split of [false, true]) {
  test(`Huehint three players: ${split ? "split victory" : "unique winner"} without hint tiebreak`, async ({
    page,
    browser,
  }) => {
    const code = await createRoomAs(page, "Ana");
    const { page: bia } = await joinRoomAs(browser, code, "Bia");
    const { page: caio } = await joinRoomAs(browser, code, "Caio");
    await configureHuehint(page);
    await page.getByRole("button", { name: "Iniciar partida" }).click();
    await expect(page.getByRole("region", { name: "Huehint", exact: true })).toBeVisible();
    const stored = await peekRoom(code);
    const topId = stored.game.state.players[0].id;
    const topName = stored.members.find((member: { id: string }) => member.id === topId).name;
    await seedHuehintFinal(code, (_round, player) => (split || player === 0 ? 1000 : 0));
    for (const participant of [page, bia, caio]) {
      await participant.reload();
      const result = participant.getByRole("region", { name: "Resultado" });
      await expect(result).toContainText(split ? "Empate dividido:" : `${topName} venceu!`);
      await expect(result).not.toContainText(/desempate|Rank da dupla/);
      await expect(participant.getByRole("region", { name: "Placar final" })).toBeVisible();
    }
  });
}

test("Huehint rules page uses the shared rank table with B as the target", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Regras", exact: true }).click();
  await expect(page).toHaveURL(/\/regras$/);
  await expect(page.getByRole("heading", { name: "Regras dos jogos" })).toBeVisible();
  const ranks = page.getByRole("table", { name: "Ranks da dupla por percentual da nota máxima" });
  for (const { rank, min } of HUEHINT_RANKS) {
    await expect(
      ranks
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader", { name: rank, exact: true }) }),
    ).toContainText(`${min * 100}%`);
  }
  await expect(
    ranks.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "B", exact: true }) }),
  ).toContainText("Vitória · Meta");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await checkAxe(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test("Huehint selector accepts mouse drags and touch taps with integer HSB values", async ({
  browser,
}) => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  await createRoomAs(page, "Ana");
  await configureHuehint(page);
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  const hue = page.getByRole("slider", { name: "Matiz", exact: true });
  await expect(hue).toBeVisible();
  const hueRect = await hue.boundingBox();
  if (!hueRect) throw new Error("Missing hue slider bounds");
  await page.mouse.move(hueRect.x + hueRect.width / 2, hueRect.y + hueRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(hueRect.x + hueRect.width / 2, hueRect.y + hueRect.height / 4);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await hue.getAttribute("aria-valuenow")))
    .toBeGreaterThan(260);
  const saturation = page.getByRole("slider", { name: "Saturação", exact: true });
  const saturationRect = await saturation.boundingBox();
  if (!saturationRect) throw new Error("Missing saturation slider bounds");
  await page.touchscreen.tap(
    saturationRect.x + saturationRect.width / 2,
    saturationRect.y + saturationRect.height / 4,
  );
  await expect
    .poll(async () => Number(await saturation.getAttribute("aria-valuenow")))
    .toBeGreaterThan(70);
  for (const slider of [hue, saturation])
    expect(Number.isInteger(Number(await slider.getAttribute("aria-valuenow")))).toBe(true);
  await page.getByRole("button", { name: "Confirmar palpite" }).click();
  await expect(
    page.getByRole("region", { name: "Revelação da rodada 1", exact: true }),
  ).toContainText(/Nota: \d+,\d{2}/);
});
