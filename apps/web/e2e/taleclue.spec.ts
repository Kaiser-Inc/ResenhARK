import path from "node:path";
import type { Page } from "@playwright/test";
import type { RoomView } from "@resenhark/shared";
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

const UI_DIR = "/home/kaiser/KaiserInc/ResenhARK/.dev-flow/2026-10-09-rodada-6-taleclue/ui";
async function screenshots(page: Page, phase: string, afterResize?: () => Promise<void>) {
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value === "dark"),
      theme,
    );
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("tab", { name: "Jogo", exact: true })).toHaveCount(
        width < 1024 ? 1 : 0,
      );
      await expect
        .poll(() =>
          page
            .locator("[data-card-id]")
            .evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).opacity === "1")),
        )
        .toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (afterResize) {
        await afterResize();
        await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: path.join(UI_DIR, `${phase}-${width}-${theme}.png`),
        fullPage: phase !== "ampliar",
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
async function selectCards(page: Page, count: number) {
  const hand = page.getByRole("region", { name: "Sua mão", exact: true });
  const buttons = hand.getByRole("button", { name: /^Carta [0-9]+$/ });
  for (let i = 0; i < count; i++) await buttons.nth(i).click();
}
for (const count of [3, 4])
  test(`Taleclue ${count} players: private hands, exact decoys, own-card block and five reveal steps`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1440, height: 900 });
    if (count === 4) await page.emulateMedia({ reducedMotion: "reduce" });
    const code = await createRoomAs(page, "Ana");
    const pages = [page];
    for (const name of ["Bia", "Caio", "Dani"].slice(0, count - 1))
      pages.push((await joinRoomAs(browser, code, name)).page);
    const snapshots = new Map<Page, RoomView>();
    for (const participant of pages) {
      participant.on("websocket", (socket) =>
        socket.on("framereceived", (frame) => {
          const text = String(frame.payload);
          if (!text.startsWith("42[")) return;
          const [event, payload] = JSON.parse(text.slice(2));
          if (event === "room:state") snapshots.set(participant, payload.room);
        }),
      );
      await participant.reload();
      await expect(participant.getByRole("region", { name: "Lobby", exact: true })).toBeVisible();
    }
    await chooseOption(page, "Jogo da sala", "Taleclue");
    await expect(pages[1].getByText("Jogo escolhido: Taleclue")).toBeVisible();
    await expect(pages[1].getByRole("combobox")).toHaveCount(0);
    await chooseOption(page, "Meta de pontos", "10");
    if (count === 3) await screenshots(page, "lobby");
    await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    for (const p of pages)
      await expect(p.getByRole("region", { name: "Taleclue", exact: true })).toBeVisible();
    const stored = await peekRoom(code);
    const allHands = Object.values(stored.game.state.hands) as string[][];
    for (let i = 0; i < pages.length; i++) {
      const ids = await pages[i]
        .getByRole("region", { name: "Sua mão", exact: true })
        .locator("[data-card-id]")
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-card-id")));
      expect(ids.length).toBeGreaterThan(0);
      const snapshot = snapshots.get(pages[i]);
      if (snapshot?.game?.type !== "taleclue") throw new Error("Missing Taleclue projection");
      expect(snapshot.game.view.hand).toEqual(stored.game.state.hands[snapshot.you]);
      expect(snapshot.game.view.table).toEqual([]);
      expect(snapshot.game.view.rounds).toEqual([]);
      expect(Object.keys(snapshot.game.view)).not.toContain("hands");
      expect(ids).toEqual(snapshot.game.view.hand);
      for (const hand of allHands)
        if (!hand.includes(ids[0])) expect(ids.some((id) => hand.includes(id))).toBe(false);
    }
    let giver: Page | undefined;
    for (const p of pages) if (await p.getByLabel("Pista", { exact: true }).count()) giver = p;
    if (!giver) throw new Error("Missing narrator");
    const others = pages.filter((p) => p !== giver);
    if (count === 3) {
      await screenshots(giver, "clue");
      const hand = giver.getByRole("region", { name: "Sua mão", exact: true });
      const first = hand.getByRole("button", { name: "Carta 1", exact: true });
      await first.focus();
      await first.press("Enter");
      const zoom = hand.getByRole("button", { name: "Ampliar carta 1", exact: true });
      await zoom.click();
      await expect(giver.getByRole("dialog")).toBeVisible();
      await giver.getByRole("dialog").locator("[data-card-art]").click();
      await expect(giver.getByRole("dialog")).toBeVisible();
      await giver.keyboard.press("Escape");
      await expect(zoom).toBeFocused();
      await expect(first).toHaveAttribute("aria-pressed", "true");
      await zoom.click();
      await giver.mouse.click(8, 80);
      await expect(giver.getByRole("dialog")).toHaveCount(0);
      await expect(zoom).toBeFocused();
      await zoom.click();
      await screenshots(giver, "ampliar", async () => {
        if (!(await giver.getByRole("dialog").count())) await zoom.click();
        await expect(giver.getByRole("dialog")).toBeVisible();
      });
      await giver.getByRole("button", { name: "Fechar", exact: true }).click();
      await expect(first).toHaveAttribute("aria-pressed", "true");
    } else await selectCards(giver, 1);
    await giver.getByLabel("Pista", { exact: true }).fill("  Porta 42  ");
    await giver.getByRole("button", { name: "Enviar pista", exact: true }).click();
    await expect(
      others[0].getByText(`Selecione ${count === 3 ? 2 : 1} isca${count === 3 ? "s" : ""}`, {
        exact: true,
      }),
    ).toBeVisible();
    if (count === 3) await screenshots(others[0], "decoy");
    for (const p of others) {
      await selectCards(p, count === 3 ? 2 : 1);
      await p.getByRole("button", { name: "Jogar iscas", exact: true }).click();
    }
    for (const p of pages) {
      const table = p.getByRole("region", { name: "Mesa", exact: true });
      await expect(table.locator("[data-card-id]")).toHaveCount(count === 3 ? 5 : 4);
      await expect(table.locator("[data-owner-id], [data-voter-id]")).toHaveCount(0);
    }
    if (count === 3) await screenshots(others[0], "vote");
    for (const p of others) {
      const table = p.getByRole("region", { name: "Mesa", exact: true });
      const own = table
        .locator("[data-card-id]")
        .filter({ has: p.getByText("Sua carta", { exact: true }) });
      for (const card of await own.all())
        await expect(card.getByRole("button", { name: /^Carta [0-9]+$/ })).toBeDisabled();
      const allowed = table.getByRole("button", { name: /^Carta [0-9]+$/ });
      for (const button of await allowed.all()) {
        if (await button.isEnabled()) {
          await button.click();
          break;
        }
      }
      await p.getByRole("button", { name: "Confirmar voto", exact: true }).click();
    }
    const reveal = page.getByRole("region", { name: "Revelação da rodada 1", exact: true });
    await expect(reveal).toHaveAttribute("data-reveal-step", "0");
    for (const stage of [1, 2, 3, 4])
      await expect(reveal).toHaveAttribute("data-reveal-step", String(stage), { timeout: 5000 });
    await expect(reveal.locator("[data-owner-id]")).toHaveCount(count === 3 ? 5 : 4);
    await expect(reveal.locator("[data-voter-id]")).toHaveCount(count - 1);
    if (count === 3) await screenshots(page, "reveal");
    await expectNoAxeViolations(page);
  });

async function narrator(pages: Page[]) {
  await expect
    .poll(async () => {
      for (let i = 0; i < pages.length; i++)
        if (await pages[i].getByLabel("Pista", { exact: true }).isVisible()) return i;
      return -1;
    })
    .toBeGreaterThanOrEqual(0);
  for (const p of pages) if (await p.getByLabel("Pista", { exact: true }).isVisible()) return p;
  throw new Error("Missing narrator");
}

test("Taleclue presence: late spectator, pause, reconnect, owner end and reset", async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const code = await createRoomAs(owner, "Ana");
  await chooseOption(owner, "Jogo da sala", "Taleclue");
  await expect(owner.getByRole("button", { name: "Iniciar partida", exact: true })).toBeDisabled();
  const bia = await joinRoomAs(browser, code, "Bia");
  await expect(owner.getByRole("button", { name: "Iniciar partida", exact: true })).toBeDisabled();
  const caio = await joinRoomAs(browser, code, "Caio");
  await expect(owner.getByRole("button", { name: "Iniciar partida", exact: true })).toBeEnabled();
  await owner.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  const spectator = await joinRoomAs(browser, code, "Dani");
  await expect(spectator.page.getByText("Você está só olhando esta partida.")).toBeVisible();
  await expect(spectator.page.getByRole("region", { name: "Sua mão", exact: true })).toHaveCount(0);
  await expect(spectator.page.getByLabel("Pista", { exact: true })).toHaveCount(0);
  await screenshots(spectator.page, "espectador");
  const storedOwner = await ownerContext.storageState();
  const url = owner.url();
  await ownerContext.close();
  await bia.context.close();
  await caio.context.close();
  await expect(spectator.page.getByText("Tempo pausado", { exact: true })).toBeVisible();
  await screenshots(spectator.page, "pausa");
  const resumedContext = await browser.newContext({ storageState: storedOwner });
  const resumed = await resumedContext.newPage();
  await resumed.goto(url);
  await expect(resumed.getByRole("region", { name: "Taleclue", exact: true })).toBeVisible();
  await expect(spectator.page.getByRole("timer", { name: "Tempo restante" })).toBeVisible();
  await resumed.getByRole("button", { name: "Encerrar partida", exact: true }).click();
  await resumed.getByRole("button", { name: "Encerrar", exact: true }).click();
  await expect(resumed.getByRole("region", { name: "Resultado", exact: true })).toContainText(
    "Partida encerrada",
  );
  await expect(resumed.getByText("O dono encerrou a partida.")).toBeVisible();
  await expect(resumed.getByRole("region", { name: "Sua mão", exact: true })).toHaveCount(0);
  await expect(resumed.getByRole("timer")).toHaveCount(0);
  await screenshots(resumed, "resultado-encerrado");
  await expectNoAxeViolations(resumed);
  await resumed.getByRole("button", { name: "Outra rodada", exact: true }).click();
  await expect(resumed.getByRole("region", { name: "Lobby", exact: true })).toBeVisible();
});

test("Taleclue deadlines: voided clue, automatic decoys, no votes and history", async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  const code = await createRoomAs(page, "Ana");
  const bia = (await joinRoomAs(browser, code, "Bia")).page;
  const caio = (await joinRoomAs(browser, code, "Caio")).page;
  const pages = [page, bia, caio];
  await chooseOption(page, "Jogo da sala", "Taleclue");
  await configureTaleclueOption(page, "Tempo da pista", "30 s");
  await configureTaleclueOption(page, "Tempo das iscas", "20 s");
  await configureTaleclueOption(page, "Tempo do voto", "20 s");
  await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  await expect(page.getByText("Rodada anulada, sem pontos.")).toBeVisible({ timeout: 40000 });
  await expect(page.getByRole("heading", { name: "Rodada 2", exact: true })).toBeVisible();
  const stored = await peekRoom(code);
  expect(Object.values(stored.game.state.points)).toEqual([0, 0, 0]);
  const giver = await narrator(pages);
  await selectCards(giver, 1);
  await giver.getByLabel("Pista", { exact: true }).fill("Porta 42");
  await giver.getByRole("button", { name: "Enviar pista", exact: true }).click();
  await expect(page.getByText(/Uma isca foi jogada automaticamente por/)).toHaveCount(2, {
    timeout: 30000,
  });
  const table = page.getByRole("region", { name: "Mesa", exact: true });
  await expect(table.locator("[data-card-id]")).toHaveCount(5);
  await expect(table.locator("[data-owner-id], [data-voter-id]")).toHaveCount(0);
  await screenshots(page, "iscas-automaticas");
  await expect(page.getByText("Sem votos nesta rodada.", { exact: true })).toBeVisible({
    timeout: 35000,
  });
  const reveal = page.getByRole("region", { name: "Revelação da rodada 2", exact: true });
  await expect(reveal.locator("[data-voter-id]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Rodada 3", exact: true })).toBeVisible({
    timeout: 15000,
  });
  const history = page.getByRole("region", { name: "Rodadas anteriores", exact: true });
  await expect(history.getByText("Rodada 2", { exact: true })).toBeVisible();
  await expect(history.getByText("Rodada 1", { exact: true })).toHaveCount(0);
  await history.getByText("Rodada 2", { exact: true }).click();
  await expect(history.getByText("Sem votos nesta rodada.", { exact: true })).toBeVisible();
});

test("Taleclue reconnect during reveal seeks the deadline, then shows the projected point victory", async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  const code = await createRoomAs(page, "Ana");
  const pages = [
    page,
    (await joinRoomAs(browser, code, "Bia")).page,
    (await joinRoomAs(browser, code, "Caio")).page,
  ];
  await chooseOption(page, "Jogo da sala", "Taleclue");
  await chooseOption(page, "Meta de pontos", "10");
  await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  await expect(page.getByRole("region", { name: "Taleclue", exact: true })).toBeVisible();
  let stored = await peekRoom(code);
  // Test-only fixture: put the real players one point below the target.
  for (const player of stored.game.state.players) stored.game.state.points[player.id] = 9;
  await writeRoom(code, stored);
  const giver = await narrator(pages);
  const others = pages.filter((p) => p !== giver);
  await selectCards(giver, 1);
  await giver.getByLabel("Pista", { exact: true }).fill("Porta 42");
  await giver.getByRole("button", { name: "Enviar pista", exact: true }).click();
  for (const p of others) {
    await selectCards(p, 2);
    await p.getByRole("button", { name: "Jogar iscas", exact: true }).click();
  }
  stored = await peekRoom(code);
  const narratorCard = stored.game.state.narratorCard as string;
  const first = others[0];
  await first
    .getByRole("region", { name: "Mesa", exact: true })
    .locator(`[data-card-id="${narratorCard}"]`)
    .getByRole("button", { name: /^Carta [0-9]+$/ })
    .click();
  await first.getByRole("button", { name: "Confirmar voto", exact: true }).click();
  await first.reload();
  await expect(
    first.getByText("Voto enviado. Aguardando os outros jogadores.", { exact: true }),
  ).toBeVisible();
  await expect(first.getByRole("button", { name: "Confirmar voto", exact: true })).toHaveCount(0);
  await others[1]
    .getByRole("region", { name: "Mesa", exact: true })
    .locator(`[data-card-id="${narratorCard}"]`)
    .getByRole("button", { name: /^Carta [0-9]+$/ })
    .click();
  await others[1].getByRole("button", { name: "Confirmar voto", exact: true }).click();
  const reveal = first.getByRole("region", { name: "Revelação da rodada 1", exact: true });
  await expect(reveal).toHaveAttribute("data-reveal-step", "2", { timeout: 10000 });
  const before = (await peekRoom(code)).game.state.deadline;
  await first.reload();
  await expect
    .poll(async () => Number(await reveal.getAttribute("data-reveal-step")))
    .toBeGreaterThanOrEqual(2);
  expect((await peekRoom(code)).game.state.deadline).toBe(before);
  const revealState = (await peekRoom(code)).game.state;
  const moveStep = revealState.results[0].steps.find(
    (step: { type: string }) => step.type === "board-move",
  );
  const move = moveStep.moves.find((move: { from: number; to: number }) => move.to > move.from);
  await expect(reveal).toHaveAttribute("data-reveal-step", "4", { timeout: 8000 });
  const progress = first.locator(`[data-player-id="${move.playerId}"] .bg-primary`);
  // A reconnect skips completed steps but still animates the steps that have not begun.
  await expect
    .poll(
      async () =>
        progress.evaluate((node) => {
          const ratio =
            node.getBoundingClientRect().width /
            (node.parentElement?.getBoundingClientRect().width ?? 1);
          return ratio > 0.902 && ratio < 0.998;
        }),
      { timeout: 1200, intervals: [50, 75, 100] },
    )
    .toBe(true);
  await expect(progress).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)", { timeout: 3000 });
  await screenshots(first, "reconexao-reveal");
  await expect(page.getByRole("region", { name: "Resultado", exact: true })).toContainText(
    "Meta de pontos alcançada.",
    { timeout: 20000 },
  );
  await expect(page.getByText(/Empate dividido:/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Tabuleiro", exact: true })).toContainText(
    "11 pontos",
  );
  await expect(page.getByRole("region", { name: "Sua mão", exact: true })).toHaveCount(0);
  await screenshots(page, "resultado-pontos");
  await expectNoAxeViolations(page);
});

test("Taleclue player departure ends a three-player game with the projected reason", async ({
  page,
  browser,
}) => {
  const code = await createRoomAs(page, "Ana");
  const bia = (await joinRoomAs(browser, code, "Bia")).page;
  await joinRoomAs(browser, code, "Caio");
  await chooseOption(page, "Jogo da sala", "Taleclue");
  await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  await bia.getByRole("button", { name: "Sair da sala", exact: true }).click();
  await bia.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("region", { name: "Resultado", exact: true })).toContainText(
    "A partida ficou com menos de 3 jogadores.",
  );
  await expect(page.getByRole("region", { name: "Sua mão", exact: true })).toHaveCount(0);
  await screenshots(page, "resultado-saida");
});

async function configureTaleclueOption(page: Page, label: string, value: string) {
  await chooseOption(page, label, value);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: label, exact: true })).toContainText(value);
  await expect(page.getByRole("combobox", { name: label, exact: true })).toBeEnabled();
}
