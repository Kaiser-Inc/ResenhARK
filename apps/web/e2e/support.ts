import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  type Browser,
  type BrowserContext,
  type Page,
  test as base,
  expect,
} from "@playwright/test";

export { expect };

/**
 * `test` that closes every context the test opened with `browser.newContext()`/`newPage()`.
 * Playwright keeps them (and their animated pages and sockets) alive until the worker ends,
 * which piles up renderers during a long run and stalls the dev servers.
 */
export const test = base.extend<{ closeLeakedContexts: undefined }>({
  closeLeakedContexts: [
    async ({ browser, context }, use) => {
      const before = new Set(browser.contexts());
      await use();
      for (const leaked of browser.contexts()) {
        if (leaked !== context && !before.has(leaked))
          await leaked.close().catch((error: Error) => {
            if (!/closed/i.test(error.message)) throw error;
          });
      }
    },
    { auto: true },
  ],
});

export const UI_DIR = path.resolve(
  __dirname,
  "../../../.dev-flow/2026-10-04-rodada-1-sala-chat-hitline/ui",
);

export async function setTheme(page: Page, theme: "dark" | "light") {
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
}

export async function shot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({
    path: path.join(UI_DIR, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

export async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

/** Creates a room through the UI as `name` and waits until the room URL is open. */
export async function createRoomAs(page: Page, name: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala" }).click();
  await page.getByLabel("Seu nome").fill(name);
  await page.getByRole("button", { name: "Criar e entrar" }).click();
  await expect(page).toHaveURL(/\/sala\/[A-HJKMNP-Z]{5}$/);
  return page.url().split("/").pop() as string;
}

/** Joins an existing room through the link as `name`, in a context of its own. */
export async function joinRoomAs(
  browser: Browser,
  code: string,
  name: string,
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/sala/${code}`);
  await page.getByLabel("Seu nome").fill(name);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("list", { name: "Pessoas na sala" })).toBeVisible();
  return { page, context };
}

/** Ana creates the room, Bia joins from another browser context. */
export async function twoMembersInRoom(browser: Browser) {
  const anaContext = await browser.newContext();
  const ana = await anaContext.newPage();
  const code = await createRoomAs(ana, "Ana");
  const { page: bia, context: biaContext } = await joinRoomAs(browser, code, "Bia");
  return { ana, bia, code, anaContext, biaContext };
}

/** Picks `option` in a Base select: opens the combobox named `label`, then clicks the option. */
export async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Owner flow up to the first drawn card: import the dev deck, set N and start. */
export async function importDeckAndStart(page: Page, targetCards = "2") {
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/dev");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(page.getByText("40 faixas prontas")).toBeVisible();
  await chooseOption(page, "Cartas para vencer", targetCards);
  await page.getByRole("button", { name: "Iniciar partida" }).click();
}
