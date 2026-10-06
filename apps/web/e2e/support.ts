import net from "node:net";
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
const TEST_REDIS = new URL(process.env.E2E_REDIS_URL ?? "redis://localhost:6379/14");

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
  // On a cold dev server a click can land before hydration and do nothing: redo the whole flow.
  await expect(async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Criar sala" }).click();
    await page.getByLabel("Seu nome").fill(name);
    await page.getByRole("button", { name: "Criar e entrar" }).click();
    await expect(page).toHaveURL(/\/sala\/[A-HJKMNP-Z]{5}$/, { timeout: 5_000 });
  }).toPass({ timeout: 40_000 });
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

/**
 * Owner flow up to the first drawn card: import the dev deck, set N and start.
 * The lobby only offers 5 or more cards to win; a smaller N (a quick solo win) is
 * written straight into the running game in the e2e Redis.
 */
export async function importDeckAndStart(page: Page, targetCards = "2") {
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/dev");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(page.getByRole("button", { name: "Voltar ao baralho ResenhARK" })).toBeVisible();
  const quick = Number(targetCards) < 5;
  await chooseOption(page, "Cartas para vencer", quick ? "5" : targetCards);
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  if (!quick) return;
  const code = new URL(page.url()).pathname.split("/").pop() as string;
  await expect.poll(async () => (await peekRoom(code)).game !== null).toBe(true);
  const room = await peekRoom(code);
  room.game.state.config.targetCards = Number(targetCards);
  await redis("SET", `room:${code}`, JSON.stringify(room), "KEEPTTL");
}

/** One command against the e2e Redis (db 14); returns the bulk reply, or null for a simple one. */
function redis(...command: string[]): Promise<string | null> {
  const send = (socket: net.Socket, ...args: string[]) =>
    socket.write(
      `*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join("")}`,
    );
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(TEST_REDIS.port || 6379), TEST_REDIS.hostname);
    let data = "";
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      data += chunk.toString();
      // +OK\r\n (SELECT) then either +OK\r\n or $<len>\r\n<payload>\r\n
      const rest = data.startsWith("+OK\r\n") ? data.slice(5) : "";
      if (rest.startsWith("+")) {
        socket.end();
        resolve(null);
        return;
      }
      const match = /^\$(\d+)\r\n/.exec(rest);
      if (!match) return;
      const start = match[0].length;
      if (Buffer.byteLength(rest.slice(start)) >= Number(match[1]) + 2) {
        socket.end();
        resolve(rest.slice(start, start + Number(match[1])));
      }
    });
    send(socket, "SELECT", TEST_REDIS.pathname.slice(1) || "0");
    send(socket, ...command);
  });
}

/** Reads the stored room straight from the e2e Redis (db 14); hidden game data included. */
// biome-ignore lint/suspicious/noExplicitAny: test-only peek at the raw stored room
export async function peekRoom(code: string): Promise<any> {
  return JSON.parse((await redis("GET", `room:${code}`)) as string);
}

/** Test-only state write in db 14, preserving the room's expiry. */
export async function writeRoom(code: string, room: unknown): Promise<void> {
  await redis("SET", `room:${code}`, JSON.stringify(room), "KEEPTTL");
}

/** Overwrites `tokens` of every player in the stored e2e room (db 14); a reload then shows the new balance. */
export async function pokeTokens(code: string, tokens: number): Promise<void> {
  const room = await peekRoom(code);
  for (const player of room.game.state.players) player.tokens = tokens;
  const body = JSON.stringify(room);
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect(Number(TEST_REDIS.port || 6379), TEST_REDIS.hostname);
    const send = (...args: string[]) =>
      socket.write(
        `*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join("")}`,
      );
    let data = "";
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      data += chunk.toString();
      if ((data.match(/\r\n/g) ?? []).length >= 2) {
        socket.end();
        resolve();
      }
    });
    send("SELECT", TEST_REDIS.pathname.slice(1) || "0");
    send("SET", `room:${code}`, body, "KEEPTTL");
  });
}

/** Reads the hidden drawn card straight from the e2e Redis (db 14), so tests can answer it right. */
export async function peekDraw(
  code: string,
): Promise<{ title: string; artists: string[]; year: number }> {
  const card = (await peekRoom(code)).game.state.draw.card;
  return { title: card.title, artists: card.artists, year: card.year };
}

/** Ana and Bia in a started 2-player game (N=10); returns who plays first, found by the "Puxar carta" button. */
export async function startTwoPlayerGame(browser: Browser) {
  const { ana, bia, code } = await twoMembersInRoom(browser);
  await importDeckAndStart(ana, "10");
  const draw = (page: Page) => page.getByRole("button", { name: "Puxar carta" });
  await expect
    .poll(async () => (await draw(ana).isVisible()) || (await draw(bia).isVisible()))
    .toBe(true);
  const anaFirst = await draw(ana).isVisible();
  return {
    code,
    turn: anaFirst ? ana : bia,
    other: anaFirst ? bia : ana,
    turnName: anaFirst ? "Ana" : "Bia",
    otherName: anaFirst ? "Bia" : "Ana",
  };
}
