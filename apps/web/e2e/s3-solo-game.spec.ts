import {
  chooseOption,
  createRoomAs,
  expect,
  expectNoAxeViolations,
  importDeckAndStart,
  joinRoomAs,
  test,
} from "./support";

test("solo game: import, start, draw, guess, reveal", async ({ page }) => {
  const mediaErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") mediaErrors.push(message.text());
  });
  await createRoomAs(page, "Ana");
  await expectNoAxeViolations(page);
  await importDeckAndStart(page);

  await page.getByRole("button", { name: "Puxar carta" }).click();
  // The fixture mp3 must decode and play in headless Chromium: the progress bar moves.
  await expect(page.getByRole("button", { name: /Tocar|Pausar/ })).toBeVisible();
  const progress = page.getByRole("progressbar");
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")), { timeout: 10_000 })
    .toBeGreaterThan(0);
  expect(await page.locator("audio").evaluate((a: HTMLAudioElement) => a.error?.code ?? null)).toBe(
    null,
  );

  const gaps = page.getByRole("button", { name: /Inserir/ });
  await gaps.first().click();
  await expect(gaps.first()).toHaveAttribute("aria-pressed", "true");
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Travar palpite" }).click();
  await expect(page.getByRole("region", { name: "Virada" })).toContainText(/\d{4}/);
  expect(mediaErrors.filter((m) => /media|audio/i.test(m))).toEqual([]);
});

test("keyboard: arrows move focus between gaps and Enter chooses", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await importDeckAndStart(page);
  await page.getByRole("button", { name: "Puxar carta" }).click();
  const gaps = page.getByRole("button", { name: /Inserir/ });
  await expect(gaps).toHaveCount(2);
  // The gaps render before the phase flips to guessing; focusing a disabled one is a silent no-op.
  await expect(gaps.first()).toBeEnabled();
  await gaps.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(gaps.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(gaps.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(gaps.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(gaps.first()).toHaveAttribute("aria-pressed", "false");
});

test("gaps stay visible but disabled for a player waiting for the turn", async ({ browser }) => {
  const context = await browser.newContext();
  const ana = await context.newPage();
  const code = await createRoomAs(ana, "Ana");
  const { page: bia } = await joinRoomAs(browser, code, "Bia");
  await importDeckAndStart(ana);
  const timeline = bia.getByRole("list", { name: /^Timeline de / });
  await expect(timeline).toContainText("Inserir");
  // display-only gaps are not buttons
  await expect(bia.getByRole("button", { name: /Inserir/ })).toHaveCount(0);
  // scrollable timeline stays keyboard-reachable for a non-interactive viewer
  await expect(bia.getByRole("list", { name: /^Timeline de / })).toHaveAttribute("tabindex", "0");
});

test("non-owner sees the waiting state in the lobby", async ({ browser }) => {
  const context = await browser.newContext();
  const ana = await context.newPage();
  const code = await createRoomAs(ana, "Ana");
  const { page: bia } = await joinRoomAs(browser, code, "Bia");

  await expect(bia.getByText("Aguardando Ana iniciar")).toBeVisible();
  await expect(bia.getByRole("button", { name: "Iniciar partida" })).toHaveCount(0);
  await expect(bia.getByRole("button", { name: "Importar playlist" })).toHaveCount(0);
  await expect(bia.getByText("Cartas para vencer")).toBeVisible();
  await expect(ana.getByRole("button", { name: "Iniciar partida" })).toBeVisible();
  await expect(bia.getByText("SiteSpy")).toBeVisible();
  await expect(bia.getByText("em breve")).toHaveCount(2);
});

test("small playlist warning appears for a big N", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/dev");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(page.getByText("40 faixas prontas")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "40 faixas prontas" })).toBeVisible();
  await expect(page.getByLabel("Link da playlist")).toHaveAttribute("type", "url");
  await expect(page.getByText(/Playlist pequena/)).toHaveCount(0);
  // At most 15 cards to win, so only a short deck can trigger the warning for one player.
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/tiny");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(page.getByText(/Playlist pequena para 1 jogador e N=10/)).toBeVisible();
});

test("owner starts a new game after the game is over", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await importDeckAndStart(page);
  await expect(page.getByRole("button", { name: "Puxar carta" })).toBeVisible();
  await page.getByRole("button", { name: "Encerrar partida" }).click();
  await page.getByRole("button", { name: "Encerrar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Resultado" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Resultado" }).getByText(/^\d+ fichas?$/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Outra rodada" }).click();
  await expect(page.getByText("40 faixas prontas")).toBeVisible();
  await page.reload();
  await expect(page.getByText("40 faixas prontas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar partida" })).toBeVisible();
});
