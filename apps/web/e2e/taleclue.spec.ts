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
