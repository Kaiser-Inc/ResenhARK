import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
  chooseOption,
  createRoomAs,
  expect,
  expectNoAxeViolations,
  joinRoomAs,
  openPlaylistImport,
  peekRoom,
  test,
} from "./support";

const DIR = path.resolve(__dirname, "../output/playwright/ui-polish");
const WIDTHS = [360, 390, 768, 1023, 1024, 1279, 1280, 1440, 1920];

test("responsive layouts preserve drafts and hidden games ignore global shortcuts", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const code = await createRoomAs(page, "Ana");
  await openPlaylistImport(page);
  await page.getByLabel("Link da playlist").fill("my draft");
  for (const width of [1440, 360, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel("Link da playlist")).toHaveValue("my draft");
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await chooseOption(page, "Jogo da sala", "Huehint");
  await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar palpite", exact: true }).click();
  await expect(page.getByRole("button", { name: "Próxima cor", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Chat/ }).click();
  await expect(page.getByRole("log", { name: "Mensagens" })).toBeVisible();

  await page.locator("#main-content").focus();
  await page.keyboard.press("Enter");
  expect((await peekRoom(code)).game.state.phase).toBe("reveal");
  await page.getByRole("tab", { name: "Jogo", exact: true }).click();
  await page.getByRole("region", { name: "Huehint", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator('[data-slot="room-header"]').getByText("Rodada 2 / 5", { exact: true }),
  ).toBeVisible();
});

async function centerDifference(page: Page) {
  const actions = page.locator('[data-slot="room-header-actions"]');
  const chat = await actions.getByRole("button", { name: /^Chat/ }).boundingBox();
  const rules = await actions.getByRole("button", { name: "Regras", exact: true }).boundingBox();
  if (!chat || !rules) return Number.POSITIVE_INFINITY;
  return Math.abs(chat.y + chat.height / 2 - rules.y - rules.height / 2);
}

test("three games share aligned actions across every layout, phase and chat state", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  await fs.mkdir(DIR, { recursive: true });
  const code = await createRoomAs(page, "Ana");
  const { page: member } = await joinRoomAs(browser, code, "Bia");
  await joinRoomAs(browser, code, "Caio");
  const rows: {
    game: string;
    phase: string;
    width: number;
    chat: string;
    delta: number | null;
    capture: string;
  }[] = [];
  for (const game of ["Hitline", "Huehint", "Taleclue"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await chooseOption(page, "Jogo da sala", game);
    for (const phase of ["lobby", "running", "game-over"]) {
      if (phase === "running") {
        await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "Encerrar partida", exact: true }),
        ).toBeVisible();
      } else if (phase === "game-over") {
        await page.getByRole("button", { name: "Encerrar partida", exact: true }).click();
        await page.getByRole("button", { name: "Encerrar", exact: true }).click();
        await expect(page.getByRole("button", { name: "Outra rodada", exact: true })).toBeVisible();
        await expect(member.getByText("Aguardando o dono", { exact: true })).toBeVisible();
        await expect(member.getByRole("button", { name: "Outra rodada", exact: true })).toHaveCount(
          0,
        );
      }
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        if (width >= 1280) {
          const collapse = page.getByRole("button", { name: "Recolher chat", exact: true });
          if (await collapse.isVisible()) await collapse.click();
          await expect(page.locator('aside[aria-label="Chat"]')).toHaveAttribute("inert", "");
          await expect
            .poll(async () => (await page.locator('aside[aria-label="Chat"]').boundingBox())?.width)
            .toBe(0);
        } else if (width < 1024) {
          await page.getByRole("tab", { name: "Jogo", exact: true }).click();
          await expect(page.getByRole("log", { name: "Mensagens" })).toBeHidden();
        }
        await expect
          .poll(async () => {
            const edge = await page
              .locator('[data-slot="room-content"]')
              .evaluate(
                (node) =>
                  node.getBoundingClientRect().right -
                  Number.parseFloat(getComputedStyle(node).paddingRight),
              );
            const chat = await page
              .locator('[data-slot="room-header-actions"]')
              .getByRole("button", { name: /^Chat/ })
              .boundingBox();
            return chat ? Math.abs(edge - chat.x - chat.width) : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(1);
        let delta: number | null = null;
        if (phase !== "lobby") {
          await expect.poll(() => centerDifference(page)).toBeLessThanOrEqual(1);
          delta = await centerDifference(page);
          const action = page.getByRole("button", {
            name: phase === "running" ? "Encerrar partida" : "Outra rodada",
            exact: true,
          });
          await expect(action).toBeVisible();
          expect(
            await action.evaluate(
              (node) => node.closest('[data-slot="room-header-actions"]') !== null,
            ),
          ).toBe(true);
        }
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), {
            message: `${game} ${phase} ${width}px must fit after resize`,
          })
          .toBe(true);
        for (const chat of ["closed", "open"]) {
          if (chat === "open") {
            await page
              .locator('[data-slot="room-header-actions"]')
              .getByRole("button", { name: /^Chat/ })
              .click();
            await expect(page.getByRole("log", { name: "Mensagens" })).toBeVisible();
            if (width >= 1280)
              await expect
                .poll(
                  async () => (await page.locator('aside[aria-label="Chat"]').boundingBox())?.width,
                )
                .toBe(360);
            else if (width < 1024)
              await expect(page.getByRole("tabpanel", { name: /^Chat/ })).toHaveCSS("opacity", "1");
            else
              await expect
                .poll(() =>
                  page
                    .getByRole("dialog", { name: "Chat", exact: true })
                    .evaluate((node) => node.getAnimations().length),
                )
                .toBe(0);
          }
          const capture = `${game.toLowerCase()}-${phase}-${width}-${chat}.png`;
          await page.screenshot({
            path: path.join(DIR, capture),
            fullPage: true,
            animations: "allow",
          });
          rows.push({ game, phase, width, chat, delta: chat === "closed" ? delta : null, capture });
          if (chat === "open") {
            if (width >= 1280)
              await page.getByRole("button", { name: "Recolher chat", exact: true }).click();
            else if (width >= 1024) {
              await page.keyboard.press("Escape");
              await expect(page.getByRole("dialog", { name: "Chat", exact: true })).toHaveCount(0);
            } else await page.getByRole("tab", { name: "Jogo", exact: true }).click();
          }
        }
      }
      await expectNoAxeViolations(page);
    }
    await page.getByRole("button", { name: "Outra rodada", exact: true }).click();
    await expect(page.getByRole("region", { name: "Lobby", exact: true })).toBeVisible();
  }
  // The same RoomCode renders in the sidebar and the mobile room menu.
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["dark", "light"]) {
      await page.evaluate((theme) => {
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(theme);
      }, theme);
      if (width === 390)
        await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
      const container =
        width === 390
          ? page.getByRole("dialog")
          : page.getByRole("complementary", { name: "Painel da sala", exact: true });
      const copy = container.getByRole("button", { name: "Copiar link", exact: true });
      await expect(copy).toBeVisible();
      await expect(copy).toHaveClass(/w-full justify-start/);
      const codeNode = container.locator('p[translate="no"]');
      await expect(codeNode).toHaveClass(/text-primary-text/);
      const geometry = await container.evaluate((node) => {
        const code = node.querySelector('p[translate="no"]');
        const copy = Array.from(node.querySelectorAll("button")).find((button) =>
          button.textContent?.includes("Copiar link"),
        );
        const label = Array.from(node.querySelectorAll("p")).find(
          (p) => p.textContent === "Código da sala",
        );
        if (!code || !copy || !label) throw new Error("Missing room code controls");
        const codeBox = code.getBoundingClientRect();
        const copyBox = copy.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        return {
          codeWidth: codeBox.width,
          copyWidth: copyBox.width,
          codeDelta: Math.abs(codeBox.x + codeBox.width / 2 - copyBox.x - copyBox.width / 2),
          labelDelta: Math.abs(labelBox.x + labelBox.width / 2 - copyBox.x - copyBox.width / 2),
        };
      });
      expect(geometry.codeWidth).toBeLessThanOrEqual(geometry.copyWidth);
      expect(geometry.codeDelta).toBeLessThanOrEqual(1);
      expect(geometry.labelDelta).toBeLessThanOrEqual(1);
      expect(await codeNode.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await container.screenshot({ path: path.join(DIR, `room-code-${width}-${theme}.png`) });
      if (width === 390) await page.keyboard.press("Escape");
    }
  }
  await fs.writeFile(path.join(DIR, "matrix.json"), JSON.stringify(rows, null, 2));
});

test("all chip groups preserve rapid full lists and delayed failures cannot replace newer choices", async ({
  page,
  browser,
}) => {
  let hold = false;
  let release = () => {};
  let reject = false;
  let rejectVote = () => {};
  await page.routeWebSocket(/socket\.io/, (socket) => {
    const server = socket.connectToServer();
    const buffered: (string | Buffer)[] = [];
    socket.onMessage((message) => {
      const match = /^42(\d+)\["lobby:vote-genres",/.exec(message.toString());
      if (reject && match) {
        reject = false;
        rejectVote = () => socket.send(`43${match[1]}[{"ok":false,"error":"invalid-input"}]`);
      } else server.send(message);
    });
    server.onMessage((message) => {
      if (hold) buffered.push(message);
      else socket.send(message);
    });
    release = () => {
      hold = false;
      for (const frame of buffered.splice(0)) socket.send(frame);
    };
  });
  const code = await createRoomAs(page, "Ana");
  const { page: member } = await joinRoomAs(browser, code, "Bia");
  for (const groupName of ["Seu voto", "Lista da partida", "Épocas"]) {
    const group = page.getByRole("group", { name: groupName, exact: true });
    const a = group.getByRole("button", {
      name: groupName === "Épocas" ? /^Anos 60,/ : /^Rock(?:,|$)/,
    });
    const b = group.getByRole("button", {
      name: groupName === "Épocas" ? /^Anos 70,/ : /^Pop(?:,|$)/,
    });
    const initial = await a.getAttribute("aria-pressed");
    const otherInitial = await b.getAttribute("aria-pressed");
    const before = await a.boundingBox();
    hold = true;
    await a.click();
    expect((await a.boundingBox())?.width).toBe(before?.width);
    await b.click();
    await a.click();
    await expect(a).toHaveAttribute("aria-pressed", initial ?? "false");
    await expect(b).toHaveAttribute("aria-pressed", otherInitial === "true" ? "false" : "true");
    expect((await a.boundingBox())?.width).toBe(before?.width);
    release();
    await expect(group).toHaveAttribute("aria-busy", "false");
    await expect(a).toHaveAttribute("aria-pressed", initial ?? "false");
    await expect(b).toHaveAttribute("aria-pressed", otherInitial === "true" ? "false" : "true");
  }
  const votes = page.getByRole("group", { name: "Seu voto", exact: true });
  const rock = votes.getByRole("button", { name: /^Rock,/ });
  const pop = votes.getByRole("button", { name: /^Pop,/ });
  reject = true;
  await rock.click();
  await expect(rock).toHaveAttribute("aria-pressed", "true");
  await pop.click();
  rejectVote();
  await expect(page.getByText("Confere os dados e tenta de novo.", { exact: true })).toBeVisible();
  await expect(votes).toHaveAttribute("aria-busy", "false");
  await expect(rock).toHaveAttribute("aria-pressed", "true");
  await expect(pop).toHaveAttribute("aria-pressed", "false");
  await expect(
    member
      .getByRole("group", { name: "Seu voto", exact: true })
      .getByRole("button", { name: "Rock, 1 voto", exact: true }),
  ).toBeVisible();
  // With no newer click, rejection restores the last server selection.
  reject = true;
  await rock.click();
  await expect(rock).toHaveAttribute("aria-pressed", "false");
  rejectVote();
  await expect(votes).toHaveAttribute("aria-busy", "false");
  await expect(rock).toHaveAttribute("aria-pressed", "true");
});
