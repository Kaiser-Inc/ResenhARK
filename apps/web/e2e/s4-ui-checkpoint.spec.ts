import type { Browser, Page } from "@playwright/test";
import {
  createRoomAs,
  expect,
  importDeckAndStart,
  peekDraw,
  setTheme,
  shot,
  test,
} from "./support";

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
] as const;

async function joinAs(
  browser: Browser,
  code: string,
  name: string,
  viewport: { width: number; height: number },
  theme: "dark" | "light",
): Promise<Page> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await setTheme(page, theme);
  await page.goto(`/sala/${code}`);
  await page.getByLabel("Seu nome").fill(name);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/Aguardando Ana iniciar/)).toBeVisible();
  return page;
}

/** Screenshots for the slice 4 UI checkpoint; they live in .dev-flow/.../ui. */
for (const viewport of VIEWPORTS) {
  for (const theme of ["dark", "light"] as const) {
    test(`ui checkpoint ${viewport.name} ${theme}`, async ({ browser, page: ana }) => {
      test.setTimeout(120_000);
      const name = (screen: string) => `s4-${screen}-${viewport.name}-${theme}`;
      await ana.setViewportSize(viewport);
      await setTheme(ana, theme);
      const code = await createRoomAs(ana, "Ana");
      const bia = await joinAs(browser, code, "Bia", viewport, theme);
      const caio = await joinAs(browser, code, "Caio", viewport, theme);
      await importDeckAndStart(ana, "10");

      const pages = [ana, bia, caio];
      const draw = (p: Page) => p.getByRole("button", { name: "Puxar carta" });
      await expect
        .poll(async () => (await Promise.all(pages.map((p) => draw(p).isVisible()))).includes(true))
        .toBe(true);
      const visible = await Promise.all(pages.map((p) => draw(p).isVisible()));
      const turn = pages[visible.indexOf(true)];
      const [x, y] = pages.filter((p) => p !== turn);

      await draw(turn).click();
      await turn.getByRole("button", { name: "Sortear outra (1 ficha)" }).click();
      await expect(turn.getByText(/Carta descartada/)).toBeVisible();
      await turn.getByRole("button", { name: "Sortear outra (1 ficha)" }).click();
      await expect(turn.getByRole("button", { name: "Sortear outra (1 ficha)" })).toBeDisabled();
      await shot(turn, name("disabled-reasons"));

      const card = await peekDraw(code);
      await turn.getByLabel("Música").fill(card.title);
      await turn.getByLabel("Artista").fill("Fulano de Tal");
      await turn
        .getByRole("button", { name: /Inserir/ })
        .first()
        .click();
      await shot(turn, name("guessing"));
      await turn.getByRole("button", { name: "Travar palpite" }).click();

      await expect(x.getByText("Contestar custa 1 ficha")).toBeVisible();
      await shot(x, name("contest-contester"));
      await shot(turn, name("contest-turn"));
      await x
        .getByRole("button", { name: /Inserir/ })
        .last()
        .click();
      await expect(y.getByText(/contestou/)).toBeVisible();
      await shot(y, name("contest-occupied"));
      if (viewport.name === "390") {
        await y.getByRole("tab", { name: "Chat" }).click();
        await expect(y.getByText(/Contestação aberta/)).toBeVisible();
        await shot(y, name("contest-chat-tab"));
        await y.getByRole("tab", { name: "Jogo" }).click();
      }
      await y.getByRole("button", { name: "Passar" }).click();

      await expect(turn.getByRole("region", { name: "Virada" })).toContainText(/acertou/);
      await shot(turn, name("reveal-mixed"));
    });
  }
}
