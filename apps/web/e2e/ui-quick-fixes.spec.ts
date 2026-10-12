import path from "node:path";
import type { Page } from "@playwright/test";
import {
  UI_DIR,
  chooseOption,
  createRoomAs,
  expect,
  expectNoAxeViolations,
  importDeckAndStart,
  joinRoomAs,
  peekRoom,
  test,
  twoMembersInRoom,
  writeRoom,
} from "./support";

const VOLUME_KEY = "resenhark:hitline:volume";
const CHAT_KEY = "resenhark:chat:wide-closed";

async function drawSnippet(page: Page) {
  const code = await createRoomAs(page, "Ana");
  await importDeckAndStart(page, "15");
  await page.getByRole("button", { name: "Puxar carta", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Volume", exact: true })).toBeVisible();
  return code;
}

for (const width of [1440, 1100, 390]) {
  test(`Hitline volume: keyboard, mute and persistence at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await drawSnippet(page);
    const volume = page.getByRole("slider", { name: "Volume", exact: true });
    await expect(volume).toHaveValue("1");
    if (width >= 1100) {
      if (width === 1440) await page.getByRole("button", { name: "Recolher chat" }).click();
      const chatButton = page.getByRole("button", { name: /^Chat/ });
      await expect
        .poll(async () => {
          const chatBox = await chatButton.boundingBox();
          const rulesBox = await page
            .getByRole("button", { name: "Regras", exact: true })
            .boundingBox();
          return Math.abs((chatBox?.y ?? 0) - (rulesBox?.y ?? 0));
        })
        .toBeLessThan(1);
      if (width === 1440) await chatButton.click();
      const sidebar = page.getByRole("complementary", { name: "Painel da sala" });
      const leave = sidebar.getByRole("button", { name: "Sair da sala", exact: true });
      const theme = sidebar.getByRole("button", { name: "Alternar tema", exact: true });
      const leaveBox = await leave.boundingBox();
      const themeBox = await theme.boundingBox();
      expect(themeBox?.x).toBe(leaveBox?.x);
      expect(themeBox?.width).toBe(leaveBox?.width);
      expect(themeBox?.height).toBe(leaveBox?.height);
      const leaveIcon = await leave.locator("svg").boundingBox();
      const themeIcon = await theme.locator("svg").boundingBox();
      expect(themeIcon?.x).toBe(leaveIcon?.x);
      expect(themeIcon?.width).toBe(leaveIcon?.width);
      await sidebar.locator(".border-t").screenshot({
        path: path.join(UI_DIR, `quick-sidebar-${width}.png`),
      });
      if (width === 1100) {
        await page.screenshot({
          path: path.join(UI_DIR, "quick-chat-header-mid.png"),
          clip: { x: 240, y: 32, width: 860, height: 80 },
        });
      }
    }
    await volume.focus();
    await volume.press("Home");
    await volume.press("ArrowRight");
    await expect(volume).toHaveValue("0.01");
    expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.volume)).toBe(
      0.01,
    );
    await page.getByRole("button", { name: "Silenciar áudio" }).click();
    expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.muted)).toBe(
      true,
    );
    await page.getByRole("button", { name: "Ativar áudio" }).click();
    await expect(volume).toHaveValue("0.01");
    expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.muted)).toBe(
      false,
    );
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), VOLUME_KEY),
    ).toEqual({ volume: 0.01, muted: false });
    await page.reload();
    await expect(volume).toHaveValue("0.01");
    expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.volume)).toBe(
      0.01,
    );
    // Muting preserves the chosen level, including across card/player remounts.
    await page.getByRole("button", { name: "Silenciar áudio" }).click();
    await page.reload();
    await expect(volume).toHaveValue("0.01");
    expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.muted)).toBe(
      true,
    );
    await page.getByRole("button", { name: "Ativar áudio" }).click();
    await expect(volume).toHaveValue("0.01");
    // A new match draws a different card and remounts SnippetPlayer.
    await drawSnippet(page);
    await expect(volume).toHaveValue("0.01");
    expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.volume)).toBe(
      0.01,
    );
    await expectNoAxeViolations(page);
    await page.screenshot({
      path: path.join(UI_DIR, `quick-hitline-${width}.png`),
      fullPage: true,
    });
  });
}

test("Hitline mute works when the browser ignores audio.volume", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "volume", {
      configurable: true,
      get: () => 1,
      set: () => {},
    });
  });
  await drawSnippet(page);
  await page.getByRole("button", { name: "Silenciar áudio" }).click();
  expect(
    await page.locator("audio").evaluate((audio: HTMLAudioElement) => ({
      volume: audio.volume,
      muted: audio.muted,
    })),
  ).toEqual({ volume: 1, muted: true });
  await page.getByRole("button", { name: "Ativar áudio" }).click();
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.muted)).toBe(
    false,
  );
});

test("volume and wide chat remain usable without preference storage", async ({ page }) => {
  await page.addInitScript(
    ({ volume, chat }) => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) {
        if (key === volume || key === chat) throw new Error("storage unavailable");
        return get.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key === volume || key === chat) throw new Error("storage unavailable");
        return set.call(this, key, value);
      };
    },
    { volume: VOLUME_KEY, chat: CHAT_KEY },
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await drawSnippet(page);
  const volume = page.getByRole("slider", { name: "Volume", exact: true });
  await expect(volume).toHaveValue("1");
  await page.getByRole("button", { name: "Silenciar áudio" }).click();
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.muted)).toBe(true);
  await page.getByRole("button", { name: "Recolher chat" }).click();
  await page.getByRole("button", { name: /^Chat/ }).click();
  await expect(page.getByRole("log", { name: "Mensagens" })).toBeVisible();
});

test("wide chat collapse frees space, persists and counts unread without changing smaller layouts", async ({
  browser,
}) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  await bia.setViewportSize({ width: 1440, height: 900 });
  const main = bia.locator("#main-content");
  const before = await main.boundingBox();
  const collapse = bia.getByRole("button", { name: "Recolher chat" });
  await expect(collapse.locator("svg")).toHaveClass(/lucide-chevron-right/);
  const sliding = bia.locator('[data-slot="wide-chat-content"]');
  await expect(sliding).toHaveCSS("transition-duration", "0.3s");
  await expect(sliding).toHaveCSS("transition-timing-function", "cubic-bezier(0.32, 0.72, 0, 1)");
  await bia.screenshot({ path: path.join(UI_DIR, "quick-chat-chevron-wide.png"), fullPage: true });
  const frames = bia.evaluate(async () => {
    const widths: number[] = [];
    const start = performance.now();
    while (performance.now() - start < 450) {
      widths.push(
        document.querySelector('aside[aria-label="Chat"]')?.getBoundingClientRect().width ?? 0,
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return widths;
  });
  await collapse.click();
  expect((await frames).some((width) => width > 0 && width < 360)).toBe(true);
  const open = bia.getByRole("button", { name: /^Chat/ });
  await expect(open).toBeVisible();
  await expect(bia.getByRole("complementary", { name: "Chat", exact: true })).toHaveCount(0);
  await expect(bia.locator('aside[aria-label="Chat"]')).toHaveAttribute("inert", "");
  await expect
    .poll(async () => ((await main.boundingBox())?.width ?? 0) - (before?.width ?? 0))
    .toBe(360);
  await ana.getByRole("textbox", { name: "Mensagem" }).fill("mensagem enquanto recolhido");
  await ana.getByRole("textbox", { name: "Mensagem" }).press("Enter");
  await expect(open).toContainText("1");
  await open.click();
  await expect(bia.getByRole("log").getByText("mensagem enquanto recolhido")).toBeVisible();
  await bia.getByRole("button", { name: "Recolher chat" }).click();
  await expect(open).not.toContainText("1");
  await bia.reload();
  await expect(open).toBeVisible();
  expect(await bia.evaluate((key) => localStorage.getItem(key), CHAT_KEY)).toBe("true");
  await bia.setViewportSize({ width: 1100, height: 900 });
  await open.click();
  await expect(bia.getByRole("dialog", { name: "Chat", exact: true })).toBeVisible();
  await bia.keyboard.press("Escape");
  await bia.setViewportSize({ width: 390, height: 900 });
  await bia.getByRole("tab", { name: /^Chat/ }).click();
  await expect(bia.getByRole("log")).toBeVisible();
  await bia.setViewportSize({ width: 1440, height: 900 });
  await expect(open).toBeVisible();
  await open.click();
  await bia.reload();
  await expect(bia.getByRole("button", { name: "Recolher chat" })).toBeVisible();
});

async function longHistory(page: Page) {
  await page.routeWebSocket(/socket\.io/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      const frame = typeof message === "string" ? message : message.toString();
      if (frame.includes('"chat:history"')) {
        const messages = Array.from({ length: 25 }, (_, i) => ({
          kind: "user",
          id: `long-${i}`,
          memberId: "demo",
          name: "Bia",
          avatar: { hue: 210, shape: 0 },
          at: Date.now(),
          text: `Mensagem longa ${i} `.repeat(40),
        }));
        ws.send(`42${JSON.stringify(["chat:history", messages])}`);
      } else ws.send(message);
    });
  });
}

for (const scrollPage of [false, true]) {
  test(`wide chat contains wheel scrolling with long messages (scrollPage=${scrollPage})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await longHistory(page);
    const code = await createRoomAs(page, "Ana");
    // Force a long lobby through expanded rules; Hitline uses its real long timeline.
    if (scrollPage) {
      await importDeckAndStart(page, "15");
      await page.getByRole("button", { name: "Puxar carta", exact: true }).click();
      const room = await peekRoom(code);
      const player = room.game.state.players[0];
      player.timeline = Array.from({ length: 15 }, (_, i) => ({
        ...player.timeline[0],
        id: `layout-${i}`,
        year: 1960 + i,
      }));
      room.game.state.turnDeadline = Date.now() + 120_000;
      await writeRoom(code, room);
      await page.reload();
    } else await page.getByRole("button", { name: "Como jogar Hitline" }).click();
    const log = page.getByRole("log", { name: "Mensagens" });
    await expect(log.getByText(/^Mensagem longa 24/)).toBeVisible();
    await expect(log).toHaveCSS("overscroll-behavior-y", "contain");
    const aside = page.getByRole("complementary", { name: "Chat", exact: true });
    expect((await aside.boundingBox())?.height).toBe(900);
    const geometry = await log.evaluate((node) => ({
      height: node.clientHeight,
      scroll: node.scrollHeight,
      parentHeight: node.parentElement?.clientHeight,
      parentScroll: node.parentElement?.scrollHeight,
    }));
    expect(geometry.scroll).toBeGreaterThan(geometry.height);
    expect(geometry.parentScroll).toBe(geometry.parentHeight);
    if (scrollPage) {
      await page.evaluate(() => window.scrollTo(0, 180));
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      expect((await aside.boundingBox())?.y).toBe(0);
    }
    for (const edge of ["bottom", "top"]) {
      await log.evaluate((node, edge) => {
        node.scrollTop = edge === "bottom" ? node.scrollHeight : 0;
      }, edge);
      const pageY = await page.evaluate(() => window.scrollY);
      const mainY = await page.locator("#main-content").evaluate((node) => node.scrollTop);
      await log.hover();
      await page.mouse.wheel(0, edge === "bottom" ? 1400 : -1400);
      await page.waitForTimeout(350);
      expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
      expect(await page.locator("#main-content").evaluate((node) => node.scrollTop)).toBe(mainY);
    }
    await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeInViewport();
    await page.screenshot({
      path: path.join(UI_DIR, `quick-chat-${scrollPage}.png`),
      fullPage: true,
    });
  });
}

test("lobby dropdowns keep padded hover and consistent triggers/items", async ({ page }) => {
  await createRoomAs(page, "Ana");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const game of ["Hitline", "Huehint", "Taleclue"]) {
      await chooseOption(page, "Jogo da sala", game);
      await expect(page.locator('[data-slot="select-content"]:visible')).toHaveCount(0);
      const help = page.getByRole("button", { name: `Como jogar ${game}` });
      await expect(help).toHaveCSS("padding-left", "12px");
      await expect(help).toHaveCSS("padding-right", "12px");
      await expect(help).toHaveCSS("margin-left", "-12px");
      for (const trigger of await page.getByRole("combobox").all()) {
        await expect(trigger).toHaveCSS("padding-left", "12px");
        await expect(trigger).toHaveCSS("padding-right", "12px");
        await trigger.click();
        for (const option of await page.getByRole("option").all()) {
          await expect(option).toHaveCSS("padding-left", "12px");
          await expect(option).toHaveCSS("padding-right", "36px");
        }
        await page.getByRole("option", { selected: true }).click();
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator('[data-slot="select-content"]:visible')).toHaveCount(0);
      }
      await help.hover();
      await page.screenshot({
        path: path.join(UI_DIR, `quick-lobby-${game}-${width}.png`),
        fullPage: true,
      });
    }
  }
});

test("Taleclue enlarged card returns to its source without moving the close button into the art", async ({
  page,
  browser,
}) => {
  const code = await createRoomAs(page, "Ana");
  await joinRoomAs(browser, code, "Bia");
  await joinRoomAs(browser, code, "Caio");
  await chooseOption(page, "Jogo da sala", "Taleclue");
  await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  const hand = page.getByRole("region", { name: "Sua mão", exact: true });
  const zoom = hand.getByRole("button", { name: "Ampliar carta 1", exact: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await zoom.click();
    const dialog = page.getByRole("dialog", { name: "Carta 1", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("transform", "none");
    await expect(dialog).toHaveCSS("opacity", "1");
    const close = page.getByRole("button", { name: "Fechar", exact: true });
    const box = await close.boundingBox();
    expect(box?.y).toBe(16);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(width - 16);
    await expectNoAxeViolations(page);
    await page.screenshot({ path: path.join(UI_DIR, `quick-taleclue-${width}.png`) });
    // Start closure without waiting for Playwright's action to settle the transition.
    await close.evaluate((button: HTMLButtonElement) => button.click());
    await expect(dialog).toHaveAttribute("data-ending-style", "");
    await expect(close).toBeHidden();
    const target = await dialog.evaluate((node) =>
      (node as HTMLElement).style.getPropertyValue("--card-return-transform"),
    );
    expect(target).toMatch(/^translate\(.+\) scale\(0\./);
    await page.waitForTimeout(80);
    expect(
      await dialog
        .locator("[data-card-zoom-art]")
        .evaluate((node) => getComputedStyle(node).transform),
    ).not.toBe("none");
    await page.screenshot({ path: path.join(UI_DIR, `quick-taleclue-return-${width}.png`) });
    await expect(dialog).toHaveCount(0);
    await expect(zoom).toBeFocused();
    // Escape/outside dismissal preserve the same focus and selection semantics.
    await zoom.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(zoom).toBeFocused();
    await zoom.click();
    await page.mouse.click(8, 80);
    await expect(dialog).toHaveCount(0);
    await expect(zoom).toBeFocused();
  }
});
