import type { Browser, Page } from "@playwright/test";
import { createRoomAs, expect, importDeckAndStart, setTheme, shot, test } from "./support";

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
  await expect(page.getByText(/Aguardando Ana iniciar|Você está assistindo/)).toBeVisible();
  return page;
}

/** Screenshots for the slice 5 UI checkpoint; they live in .dev-flow/.../ui. */
for (const viewport of VIEWPORTS) {
  for (const theme of ["dark", "light"] as const) {
    test(`ui checkpoint ${viewport.name} ${theme}`, async ({ browser, page: ana }) => {
      test.setTimeout(120_000);
      const name = (screen: string) => `s5-${screen}-${viewport.name}-${theme}`;
      await ana.setViewportSize(viewport);
      await setTheme(ana, theme);
      const code = await createRoomAs(ana, "Ana");
      const bia = await joinAs(browser, code, "Bia", viewport, theme);
      await importDeckAndStart(ana, "10");
      const draw = (p: Page) => p.getByRole("button", { name: "Puxar carta" });
      await expect
        .poll(async () => (await draw(ana).isVisible()) || (await draw(bia).isVisible()))
        .toBe(true);

      const caio = await joinAs(browser, code, "Caio", viewport, theme);
      await shot(caio, name("spectator"));

      await ana.getByRole("button", { name: "Encerrar partida" }).click();
      await expect(ana.getByRole("alertdialog")).toBeVisible();
      await shot(ana, name("end-dialog"));
      await ana.getByRole("button", { name: "Cancelar" }).click();

      const anaFirst = await draw(ana).isVisible();
      const [turn, other, turnName] = anaFirst ? [ana, bia, "Ana"] : [bia, ana, "Bia"];
      await turn.context().close();
      await expect(other.getByText(new RegExp(`^Aguardando ${turnName} · \\d+s$`))).toBeVisible();
      await shot(other, name("offline-turn"));
    });

    test(`ui checkpoint result ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setTheme(page, theme);
      await createRoomAs(page, "Ana");
      await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/tiny");
      await page.getByRole("button", { name: "Importar playlist" }).click();
      await page.getByRole("button", { name: "Iniciar partida" }).click();
      for (let i = 0; i < 2; i++) {
        await page.getByRole("button", { name: "Puxar carta" }).click();
        await page
          .getByRole("button", { name: /Inserir/ })
          .first()
          .click();
        await page.getByRole("button", { name: "Travar palpite" }).click();
      }
      await page.getByRole("button", { name: "Puxar carta" }).click();
      await expect(page.getByRole("region", { name: "Resultado" })).toContainText("Fim da pilha");
      await shot(page, `s5-result-deck-empty-${viewport.name}-${theme}`);
    });
  }
}
