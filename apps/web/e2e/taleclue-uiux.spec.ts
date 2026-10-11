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
          // RoomFrame remounts its game content at the mobile breakpoint.
          await expect(giver.getByRole("tab", { name: "Jogo", exact: true })).toHaveCount(
            width === 390 ? 1 : 0,
          );
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
          await giver.evaluate(() => window.scrollTo(0, 0));
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
      await giver.evaluate(() => window.scrollTo(0, 0));
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

async function expectSoftShadow(locator: ReturnType<Page["locator"]>) {
  await expect
    .poll(() =>
      locator.evaluate((node) => {
        return [getComputedStyle(node), getComputedStyle(node, "::after")].some((style) =>
          [...style.boxShadow.matchAll(/0px 0px ([\d.]+)px/g)].some(
            (match) => Number(match[1]) > 0,
          ),
        );
      }),
    )
    .toBe(true);
}

test("Taleclue feedback: soft selection, stable waiting and public action highlights", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const code = await createRoomAs(page, "Ana");
  const pages = [
    page,
    (await joinRoomAs(browser, code, "Bia")).page,
    (await joinRoomAs(browser, code, "Caio")).page,
  ];
  await chooseOption(page, "Jogo da sala", "Taleclue");
  await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  const giver = await narrator(pages);
  const others = pages.filter((p) => p !== giver);
  const card = giver
    .getByRole("region", { name: "Sua mão", exact: true })
    .getByRole("button", { name: /^Carta [0-9]+$/ })
    .first();
  await card.focus();
  await card.press("Space");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expectSoftShadow(card);
  await expect
    .poll(() => card.evaluate((node) => getComputedStyle(node).outlineStyle))
    .not.toBe("none");
  await giver.getByLabel("Pista", { exact: true }).focus();
  await expect(giver.getByLabel("Pista", { exact: true })).toBeFocused();
  await expect
    .poll(() => card.evaluate((node) => getComputedStyle(node).outlineStyle))
    .toBe("none");
  await card.focus();
  await card.press("Space");
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await card.press("Space");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  const waiting = others[0].locator("[data-phase-guidance]");
  const sentence = await waiting.locator('[aria-live="polite"]').innerText();
  await expect(waiting.locator('[data-waiting="true"][aria-hidden="true"]')).toBeVisible();
  await expect(waiting.locator('[data-waiting="true"] > span')).toHaveCount(3);
  await expect
    .poll(() =>
      waiting
        .locator('[data-waiting="true"] > span')
        .first()
        .evaluate((node) => getComputedStyle(node).animationName),
    )
    .not.toBe("none");
  expect(await waiting.locator('[aria-live="polite"]').innerText()).toBe(sentence);
  await giver.bringToFront();
  for (const theme of ["dark", "light"]) {
    await giver.evaluate(
      (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    for (const width of [390, 1440]) {
      await giver.setViewportSize({ width, height: 900 });
      await expect(card).toHaveAttribute("aria-pressed", "true");
      await giver.getByLabel("Pista", { exact: true }).focus();
      await expectSoftShadow(card);
      await expect
        .poll(() =>
          giver
            .locator('[aria-label="Sua mão"] [data-card-id]')
            .evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).opacity === "1")),
        )
        .toBe(true);
      await giver.evaluate(() => window.scrollTo(0, 0));
      await expectNoAxeViolations(giver);
      // Finish finite entry motion after resize before capturing the live waiting animation.
      await giver.waitForTimeout(650);
      await giver.screenshot({
        path: path.join(UI_DIR, `fatia-2-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await others[0].bringToFront();
  for (const theme of ["dark", "light"]) {
    await others[0].evaluate(
      (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    for (const width of [390, 1440]) {
      await others[0].setViewportSize({ width, height: 900 });
      await expect(others[0].locator('[data-waiting="true"]')).toBeVisible();
      await expect
        .poll(() =>
          others[0]
            .locator('[aria-label="Sua mão"] [data-card-id]')
            .evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).opacity === "1")),
        )
        .toBe(true);
      await expectNoAxeViolations(others[0]);
      await others[0].waitForTimeout(650);
      await others[0].screenshot({
        path: path.join(UI_DIR, `fatia-2-espera-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  expect(await waiting.locator('[aria-live="polite"]').innerText()).toBe(sentence);
  await giver.getByLabel("Pista", { exact: true }).fill("Porta 42");
  await giver.getByRole("button", { name: "Enviar pista", exact: true }).click();
  await expect(others[0].locator('[data-waiting="true"]')).toHaveCount(0);
  await expectSoftShadow(others[0].locator("[data-clue-display]"));
  const highlight = await others[0].locator("[data-clue-display]").evaluate((node) => {
    const animation = node
      .getAnimations({ subtree: true })
      .find(
        (animation) =>
          animation instanceof CSSAnimation && animation.animationName === "taleclue-attention",
      );
    if (!animation) return { opacity: 0, iterations: 0 };
    // Inspect the actual halo one second into its timeline, then let it finish normally.
    animation.pause();
    animation.currentTime = 1000;
    const result = {
      opacity: Number(getComputedStyle(node, "::after").opacity),
      iterations: animation.effect?.getTiming().iterations,
    };
    animation.play();
    return result;
  });
  expect(highlight.iterations).toBe(1);
  expect(highlight.opacity).toBeGreaterThanOrEqual(0.9);
  await expect
    .poll(() =>
      others[0]
        .locator("[data-clue-display]")
        .evaluate((node) => node.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  for (const other of others) {
    await selectHand(other, 2);
    await other.getByRole("button", { name: "Jogar iscas", exact: true }).click();
    if (other === others[0]) {
      await expect(other.locator('[data-waiting="true"]')).toBeVisible();
      await expect(giver.locator("[data-acted]")).toHaveCount(1);
      await expectSoftShadow(giver.locator("[data-acted]").locator(".."));
    }
  }
  for (const other of others) {
    await expect(other.locator('[data-waiting="true"]')).toHaveCount(0);
    const allowed = other
      .getByRole("region", { name: "Mesa", exact: true })
      .getByRole("button", { name: /^Carta [0-9]+$/ });
    for (const vote of await allowed.all()) {
      if (await vote.isEnabled()) {
        await vote.click();
        break;
      }
    }
    await other.getByRole("button", { name: "Confirmar voto", exact: true }).click();
    if (other === others[0]) {
      await expect(giver.locator("[data-acted]")).toHaveCount(1);
      await expectSoftShadow(giver.locator("[data-acted]").locator(".."));
    }
  }
  await expect(giver.locator('[data-waiting="true"]')).toHaveCount(0);
  const reveal = giver.getByRole("region", { name: "Revelação da rodada 1", exact: true });
  const captions = [
    "Esta era a carta do narrador",
    "Quem votou em quê",
    "Pontos por acertar",
    "Pontos das iscas",
    "Avanço no tabuleiro",
  ];
  await giver.bringToFront();
  for (let step = 0; step < captions.length; step++) {
    await expect(reveal).toHaveAttribute("data-reveal-step", String(step));
    await expect(reveal.getByRole("heading", { name: captions[step], exact: true })).toBeVisible();
    // Capture after card entry/flip, inside this step and without disabling game motion.
    await giver.waitForTimeout(step === 0 ? 1500 : 700);
    await giver.screenshot({
      path: path.join(UI_DIR, `fatia-2-reveal-${step}.png`),
      fullPage: true,
    });
  }
  await expect(reveal).toHaveAttribute("data-reveal-active", "false");
  await expectNoAxeViolations(giver);
});

type AudioStats = { contexts: number; cancelled: number; starts: { kind: string; at: number }[] };
async function observeAudio(page: Page, mode: "normal" | "storage" | "resume" = "normal") {
  await page.addInitScript((mode) => {
    const stats = { contexts: 0, cancelled: 0, starts: [] as { kind: string; at: number }[] };
    Object.assign(window, { __taleclueAudio: stats });
    if (mode === "storage") {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) {
        if (key === "resenhark:taleclue:sound-muted") throw new Error("storage unavailable");
        return get.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key === "resenhark:taleclue:sound-muted") throw new Error("storage unavailable");
        return set.call(this, key, value);
      };
    }
    const NativeAudio = window.AudioContext;
    function track<T extends AudioScheduledSourceNode>(source: T, kind: string) {
      const start = source.start.bind(source);
      const stop = source.stop.bind(source);
      source.start = (when = 0) => {
        stats.starts.push({ kind, at: when });
        start(when);
      };
      source.stop = (when) => {
        if (when === undefined) stats.cancelled++;
        stop(when);
      };
      return source;
    }
    window.AudioContext = class extends NativeAudio {
      constructor() {
        super();
        stats.contexts++;
        if (mode === "resume") Object.defineProperty(this, "state", { value: "suspended" });
      }
      resume() {
        return mode === "resume" ? Promise.reject(new Error("autoplay blocked")) : super.resume();
      }
      createOscillator() {
        return track(super.createOscillator(), "tone");
      }
      createBufferSource() {
        return track(super.createBufferSource(), "wood");
      }
    };
  }, mode);
}
async function audioStats(page: Page) {
  return page.evaluate(() => (window as Window & { __taleclueAudio: AudioStats }).__taleclueAudio);
}

test("Taleclue sound: live clues, synchronized steps, independent mute and silent reconnect", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await observeAudio(page);
  const code = await createRoomAs(page, "Ana");
  const pages = [page];
  for (const name of ["Bia", "Caio"]) {
    const joined = (await joinRoomAs(browser, code, name)).page;
    await observeAudio(joined);
    await joined.reload();
    pages.push(joined);
  }
  await chooseOption(page, "Jogo da sala", "Taleclue");
  await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  const giver = await narrator(pages);
  const others = pages.filter((p) => p !== giver);
  await expect(giver.getByRole("button", { name: "Ativar som", exact: true })).toBeVisible();
  expect((await audioStats(giver)).contexts).toBe(0);
  await giver.screenshot({ path: path.join(UI_DIR, "fatia-4-ativar.png"), fullPage: true });
  for (const player of pages) {
    if (player === others[0])
      await player.getByRole("button", { name: "Entenda esta fase", exact: true }).press("Enter");
    else await player.getByRole("button", { name: "Ativar som", exact: true }).click();
    await expect(player.getByRole("button", { name: "Som ligado", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  const muted = others[1];
  await muted.getByRole("button", { name: "Som ligado", exact: true }).click();
  await expect(muted.getByRole("button", { name: "Som desligado", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await selectHand(giver, 1);
  await giver.getByLabel("Pista", { exact: true }).fill("Madeira");
  await giver.getByRole("button", { name: "Enviar pista", exact: true }).click();
  await expect.poll(async () => (await audioStats(others[0])).starts.length).toBe(1);
  expect((await audioStats(muted)).starts.length).toBe(0);
  for (const width of [390, 1440]) {
    await others[0].setViewportSize({ width, height: 900 });
    await expect(others[0].getByRole("tab", { name: "Jogo", exact: true })).toHaveCount(
      width === 390 ? 1 : 0,
    );
    await expect(
      others[0].getByRole("button", { name: "Som ligado", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect((await audioStats(others[0])).contexts).toBe(1);
    expect((await audioStats(others[0])).starts.length).toBe(1);
  }
  await muted.getByRole("button", { name: "Som desligado", exact: true }).click();
  await expect(muted.getByRole("button", { name: "Som ligado", exact: true })).toBeVisible();
  expect((await audioStats(muted)).starts.length).toBe(0);
  await muted.getByRole("button", { name: "Som ligado", exact: true }).click();
  for (const other of others) {
    await selectHand(other, 2);
    await other.getByRole("button", { name: "Jogar iscas", exact: true }).click();
  }
  const stored = await peekRoom(code);
  const card = stored.game.state.narratorCard as string;
  for (const other of others) {
    await other
      .getByRole("region", { name: "Mesa", exact: true })
      .locator(`[data-card-id="${card}"]`)
      .getByRole("button", { name: /^Carta [0-9]+$/ })
      .click();
    await other.getByRole("button", { name: "Confirmar voto", exact: true }).click();
  }
  await expect
    .poll(async () => (await audioStats(others[0])).starts.filter((s) => s.kind === "wood").length)
    .toBe(2);
  const scheduled = (await audioStats(others[0])).starts.length;
  await others[0].context().setOffline(true);
  await expect.poll(async () => (await audioStats(others[0])).cancelled).toBeGreaterThanOrEqual(4);
  await others[0].context().setOffline(false);
  await expect(
    others[0].getByRole("region", { name: "Revelação da rodada 1", exact: true }),
  ).toBeVisible();
  await others[0].waitForTimeout(500);
  expect((await audioStats(others[0])).starts.length).toBe(scheduled);
  await muted.reload();
  await expect(muted.getByRole("button", { name: "Som desligado", exact: true })).toBeVisible();
  expect((await audioStats(muted)).contexts).toBe(0);
  expect((await audioStats(muted)).starts.length).toBe(0);
  await muted.screenshot({ path: path.join(UI_DIR, "fatia-4-mudo.png"), fullPage: true });
  await expectNoAxeViolations(muted);
  for (const theme of ["dark", "light"]) {
    await giver.evaluate(
      (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    for (const width of [390, 1440]) {
      await giver.setViewportSize({ width, height: 900 });
      await expect(giver.getByRole("tab", { name: "Jogo", exact: true })).toHaveCount(
        width === 390 ? 1 : 0,
      );
      const activate = giver.getByRole("button", { name: "Ativar som", exact: true });
      if (await activate.isVisible()) await activate.click();
      await expect(giver.getByRole("button", { name: "Som ligado", exact: true })).toBeVisible();
      await giver.evaluate(() => window.scrollTo(0, 0));
      await expectNoAxeViolations(giver);
      await giver.screenshot({
        path: path.join(UI_DIR, `fatia-4-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
});

for (const mode of ["storage", "resume"] as const) {
  test(`Taleclue sound: ${mode} failure preserves clue and decoy actions`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    await observeAudio(page, mode);
    const code = await createRoomAs(page, "Ana");
    const pages = [page];
    for (const name of ["Bia", "Caio"]) {
      const other = (await joinRoomAs(browser, code, name)).page;
      await observeAudio(other, mode);
      await other.reload();
      pages.push(other);
    }
    await chooseOption(page, "Jogo da sala", "Taleclue");
    await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
    const giver = await narrator(pages);
    await giver.getByRole("button", { name: "Ativar som", exact: true }).click();
    if (mode === "resume")
      await expect(giver.getByRole("button", { name: "Ativar som", exact: true })).toBeVisible();
    else {
      await giver.getByRole("button", { name: "Som ligado", exact: true }).click();
      await expect(giver.getByRole("button", { name: "Som desligado", exact: true })).toBeVisible();
    }
    await selectHand(giver, 1);
    await giver.getByLabel("Pista", { exact: true }).fill("Porta");
    await giver.getByRole("button", { name: "Enviar pista", exact: true }).click();
    for (const other of pages.filter((p) => p !== giver)) {
      await selectHand(other, 2);
      await other.getByRole("button", { name: "Jogar iscas", exact: true }).click();
    }
    await expect(giver.getByRole("heading", { name: "Mesa", exact: true })).toBeVisible();
    if (mode === "resume") expect((await audioStats(giver)).starts.length).toBe(0);
    await expectNoAxeViolations(giver);
  });
}

test("Taleclue lifecycle: paused reveal freezes for an online spectator", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const code = await createRoomAs(page, "Ana");
  const players = [
    page,
    (await joinRoomAs(browser, code, "Bia")).page,
    (await joinRoomAs(browser, code, "Caio")).page,
  ];
  await chooseOption(page, "Jogo da sala", "Taleclue");
  await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  const spectator = (await joinRoomAs(browser, code, "Dani")).page;
  const giver = await narrator(players);
  await selectHand(giver, 1);
  await giver.getByLabel("Pista", { exact: true }).fill("Madeira");
  await giver.getByRole("button", { name: "Enviar pista", exact: true }).click();
  const others = players.filter((p) => p !== giver);
  for (const other of others) {
    await selectHand(other, 2);
    await other.getByRole("button", { name: "Jogar iscas", exact: true }).click();
  }
  const stored = await peekRoom(code);
  const card = stored.game.state.narratorCard as string;
  for (const other of others) {
    await other
      .getByRole("region", { name: "Mesa", exact: true })
      .locator(`[data-card-id="${card}"]`)
      .getByRole("button", { name: /^Carta [0-9]+$/ })
      .click();
    await other.getByRole("button", { name: "Confirmar voto", exact: true }).click();
  }
  const pawn = spectator.locator(
    `[data-player-id="${stored.game.state.players.find((p: { id: string }) => p.id !== stored.game.state.narratorId).id}"]`,
  );
  await expect(pawn).toHaveAttribute("data-moving", "true", { timeout: 15000 });
  await Promise.all(players.map((p) => p.context().setOffline(true)));
  await expect(spectator.getByText("Tempo pausado", { exact: true })).toBeVisible();
  await expect(pawn).toHaveAttribute("data-moving", "false");
  expect(Number(await pawn.getAttribute("data-position"))).toBeLessThan(2);
  const before = await pawn.boundingBox();
  const position = await pawn.getAttribute("data-position");
  await spectator.waitForTimeout(700);
  expect(await pawn.getAttribute("data-position")).toBe(position);
  const after = await pawn.boundingBox();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(1);
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(1);
  await page.context().setOffline(false);
  await expect(spectator.getByText("Tempo pausado", { exact: true })).toHaveCount(0);
  await expect(
    spectator.getByRole("region", { name: "Revelação da rodada 1", exact: true }),
  ).toHaveAttribute("data-reveal-step", "0");
  await expect(pawn).toHaveAttribute("data-position", "0");
});

test("Taleclue lifecycle: urgency is announced once across resize and game tab remount", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const code = await createRoomAs(page, "Ana");
  const players = [
    page,
    (await joinRoomAs(browser, code, "Bia")).page,
    (await joinRoomAs(browser, code, "Caio")).page,
  ];
  await chooseOption(page, "Jogo da sala", "Taleclue");
  await page.getByRole("button", { name: "Iniciar partida", exact: true }).click();
  const giver = await narrator(players);
  const stored = await peekRoom(code);
  stored.game.state.deadline = Date.now() + 9500;
  await writeRoom(code, stored);
  await giver.reload();
  await expect(giver.getByText("Faltam 10 segundos.", { exact: true })).toHaveCount(1);
  await giver.setViewportSize({ width: 390, height: 900 });
  await expect(giver.getByRole("tab", { name: "Jogo", exact: true })).toBeVisible();
  await expect(giver.locator("[data-urgent]")).toHaveAttribute("data-urgent", "true");
  await expect(giver.getByText("Faltam 10 segundos.", { exact: true })).toHaveCount(0, {
    timeout: 1000,
  });
  await giver.getByRole("tab", { name: "Chat", exact: true }).click();
  await giver.getByRole("tab", { name: "Jogo", exact: true }).click();
  await expect(giver.locator("[data-urgent]")).toHaveAttribute("data-urgent", "true");
  await expect(giver.getByText("Faltam 10 segundos.", { exact: true })).toHaveCount(0, {
    timeout: 1000,
  });
});
