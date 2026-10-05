import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import {
  createRoomAs,
  expect,
  importDeckAndStart,
  joinRoomAs,
  peekDraw,
  setTheme,
  startTwoPlayerGame,
  test,
  twoMembersInRoom,
} from "./support";

/** Presses Tab until `target` has focus: the keyboard-only way to "click" it. */
async function tabTo(page: Page, target: Locator) {
  const el = target.first();
  for (let i = 0; i < 60; i++) {
    if (await el.evaluate((node) => node === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`could not reach ${target} with Tab`);
}

/** Draw, choose the first gap with the arrow keys, type the guess and lock it, with no mouse. */
async function playTurnByKeyboard(page: Page) {
  await tabTo(page, page.getByRole("button", { name: "Puxar carta" }));
  await page.keyboard.press("Enter");
  const gaps = page.getByRole("button", { name: /Inserir/ });
  await expect(gaps.first()).toBeEnabled();
  await tabTo(page, gaps);
  await page.keyboard.press("ArrowDown");
  await expect(gaps.nth(1)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(gaps.nth(1)).toHaveAttribute("aria-pressed", "true");
  await tabTo(page, page.getByLabel("Música"));
  await page.keyboard.type("zzz");
  await page.keyboard.press("Tab");
  await page.keyboard.type("yyy");
  await tabTo(page, page.getByRole("button", { name: "Travar palpite" }));
  await page.keyboard.press("Enter");
}

test("keyboard only: draw, choose a slot with arrows, lock, and the other player contests and passes", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { turn, other } = await startTwoPlayerGame(browser);
  await playTurnByKeyboard(turn);

  // The second player contests the only free gap by keyboard.
  const free = other.getByRole("button", { name: /Inserir/ });
  await expect(free).toHaveCount(1);
  await tabTo(other, free);
  await other.keyboard.press("Enter");
  await expect(other.getByRole("region", { name: "Virada" })).toBeVisible();

  // Next turn is the other player's; the first one passes with the keyboard.
  await playTurnByKeyboard(other);
  const pass = turn.getByRole("button", { name: "Passar" });
  await expect(pass).toBeVisible();
  // The previous reveal is gone while a new card is in play, so a Virada here can only come from the pass.
  await expect(turn.getByRole("region", { name: "Virada" })).toHaveCount(0);
  await tabTo(turn, pass);
  await turn.keyboard.press("Enter");
  // Only the pass produces these: a new reveal and the next turn for the first player.
  await expect(turn.getByRole("button", { name: "Puxar carta" })).toBeVisible();
  await expect(turn.getByRole("region", { name: "Virada" })).toContainText(/\d{4}/);
});

test("the winner is announced", async ({ page }) => {
  const code = await createRoomAs(page, "Ana");
  await importDeckAndStart(page, "2");
  await page.getByRole("button", { name: "Puxar carta" }).click();
  const card = await peekDraw(code);
  const starter = Number(
    (await page.getByRole("list", { name: /^Timeline de / }).innerText()).match(/\d{4}/)?.[0],
  );
  const gaps = page.getByRole("button", { name: /Inserir/ });
  await expect(gaps.first()).toBeEnabled();
  await gaps.nth(card.year >= starter ? 1 : 0).click();
  await page.getByRole("button", { name: "Travar palpite" }).click();
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: "Ana venceu" })).toHaveCount(
    1,
  );
});

test("reveal is announced in the live region", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await importDeckAndStart(page, "2");
  await page.getByRole("button", { name: "Puxar carta" }).click();
  await page
    .getByRole("button", { name: /Inserir/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Travar palpite" }).click();
  await expect(page.getByRole("region", { name: "Virada" })).toBeVisible();
  const live = page.locator('[aria-live="polite"]').filter({ hasText: "Carta virada:" });
  // exactly one live region says it, and it carries the year
  await expect(live).toHaveCount(1);
  await expect(live).toContainText(/Carta virada: \d{4},/);
});

test("turn and contest changes are announced to each player", async ({ browser }) => {
  test.setTimeout(60_000);
  const { code, turn, other, turnName, otherName } = await startTwoPlayerGame(browser);
  const live = (page: Page, text: string | RegExp) =>
    page.locator('[aria-live="polite"]').filter({ hasText: text });
  await expect(live(turn, "Sua vez")).toHaveCount(1);
  await expect(live(other, `Vez de ${turnName}`)).toHaveCount(1);
  await turn.getByRole("button", { name: "Puxar carta" }).click();
  const card = await peekDraw(code);
  await turn
    .getByRole("button", { name: /Inserir/ })
    .first()
    .click();
  await turn.getByRole("button", { name: "Travar palpite" }).click();
  await expect(live(other, /Contestação aberta, \d+ segundos/)).toHaveCount(1);
  // Before the reveal no live region may leak the hidden card.
  for (const page of [turn, other]) {
    const spoken = (await page.locator('[aria-live="polite"]').allInnerTexts()).join(" ");
    expect(spoken).not.toContain(String(card.year));
    expect(spoken).not.toContain(card.title);
  }
  await other
    .getByRole("button", { name: /Inserir/ })
    .first()
    .click();
  for (const page of [turn, other]) {
    await expect(live(page, `${otherName} contestou`)).toHaveCount(1);
    await expect(live(page, /Carta virada: \d{4},/)).toHaveCount(1);
  }
});

for (const { theme, width, height } of [
  { theme: "dark", width: 1440, height: 900 },
  { theme: "light", width: 1440, height: 900 },
  { theme: "dark", width: 390, height: 844 },
  { theme: "light", width: 390, height: 844 },
] as const) {
  test(`axe has no violations on every screen (${theme} ${width})`, async ({ browser, page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setTheme(page, theme);
    const check = async (p: Page, screen: string) => {
      // 1.2 s lets the transient "+1" gain (1 s fade) finish: axe blends text with its mid-fade opacity.
      await expect(p.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await p.waitForTimeout(1_200);
      const { violations } = await new AxeBuilder({ page: p }).analyze();
      expect(
        violations.map(
          (v) => `${screen} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
      ).toEqual([]);
    };

    // The api rate-limits logins (5 per minute), so /admin/spotify runs on mocked responses.
    await page.route("**/admin/login", (route) => route.fulfill({ json: { adminToken: "mock" } }));
    await page.route("**/admin/spotify/status", (route) =>
      route.fulfill({ json: { connected: true, configured: true } }),
    );
    await page.goto("/admin/spotify");
    await check(page, "admin-login");
    await page.getByLabel("Senha", { exact: true }).fill("dev");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Conectado")).toBeVisible();
    await check(page, "admin");

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Criar sala" })).toBeVisible();
    await check(page, "home");

    const { ana, bia, code, biaContext } = await twoMembersInRoom(browser);
    for (const p of [ana, bia]) await p.setViewportSize({ width, height });
    for (const p of [ana, bia]) await p.evaluate((v) => localStorage.setItem("theme", v), theme);
    for (const p of [ana, bia]) await p.reload();
    await check(ana, "lobby-owner");
    await check(bia, "lobby-member");

    const joinContext = await browser.newContext();
    const joiner = await joinContext.newPage();
    await joiner.addInitScript((v) => localStorage.setItem("theme", v), theme);
    await joiner.setViewportSize({ width, height });
    await joiner.emulateMedia({ reducedMotion: "reduce" });
    await joiner.goto(`/sala/${code}`);
    await expect(joiner.getByLabel("Seu nome")).toBeVisible();
    await check(joiner, "join-form");
    await joinContext.close();

    for (const p of [ana, bia]) await p.emulateMedia({ reducedMotion: "reduce" });
    await importDeckAndStart(ana, "10");
    const draw = (p: Page) => p.getByRole("button", { name: "Puxar carta" });
    await expect
      .poll(async () => (await draw(ana).isVisible()) || (await draw(bia).isVisible()))
      .toBe(true);
    const [turn, other] = (await draw(ana).isVisible()) ? [ana, bia] : [bia, ana];
    await draw(turn).click();
    await turn
      .getByRole("button", { name: /Inserir/ })
      .first()
      .click();
    await check(turn, "guessing");
    await turn.getByLabel("Música").fill("zzz");
    await turn.getByRole("button", { name: "Travar palpite" }).click();
    await expect(other.getByRole("timer")).toBeVisible();
    await check(other, "contest-other");
    await check(turn, "contest-turn");
    await other.getByRole("button", { name: "Passar" }).click();
    await expect(turn.getByRole("region", { name: "Virada" })).toBeVisible();
    await check(turn, "reveal");

    const owner = ana;
    await owner.getByRole("button", { name: "Encerrar partida" }).click();
    await owner.getByRole("button", { name: "Encerrar", exact: true }).click();
    await expect(owner.getByRole("region", { name: "Resultado" })).toBeVisible();
    await check(owner, "result");
    await biaContext.close();
  });
}

test("text tokens keep 4.5:1 contrast on background and muted", async ({ page }) => {
  const tokens = [
    "--foreground",
    "--muted-foreground",
    "--primary-text",
    "--success",
    "--warning",
    "--destructive",
  ];
  const ratios: string[] = [];
  for (const theme of ["dark", "light"] as const) {
    await setTheme(page, theme);
    await page.goto("/");
    const lows = await page.evaluate((names) => {
      const css = getComputedStyle(document.documentElement);
      // A 1x1 canvas resolves any CSS color (oklch included) to RGB, as the confetti does.
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no canvas");
      const rgb = (token: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = css.getPropertyValue(token).trim();
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
      };
      const lum = ([r, g, b]: number[]) => {
        const [R, G, B] = [r, g, b].map((c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * R + 0.7152 * G + 0.0722 * B;
      };
      const ratio = (a: string, b: string) => {
        const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      return names.flatMap((n) =>
        ["--background", "--muted"].map((bg) => `${n} on ${bg}: ${ratio(n, bg).toFixed(2)}`),
      );
    }, tokens);
    ratios.push(...lows.map((l) => `${theme} ${l}`));
  }
  const failing = ratios.filter((r) => Number(r.split(": ")[1]) < 4.5);
  expect(failing, ratios.join("\n")).toEqual([]);
});
