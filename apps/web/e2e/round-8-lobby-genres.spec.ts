import path from "node:path";
import type { Page } from "@playwright/test";
import {
  createRoomAs,
  expect,
  expectNoAxeViolations,
  joinRoomAs,
  openPlaylistImport,
  peekRoom,
  test,
} from "./support";

const UI_DIR =
  process.env.E2E_UI_DIR ?? path.resolve(__dirname, "../output/playwright/round-8-lobby");
const votes = (page: Page) => page.getByRole("group", { name: "Seu voto", exact: true });
const list = (page: Page) => page.getByRole("group", { name: "Lista da partida", exact: true });
const decades = (page: Page) => page.getByRole("group", { name: "Épocas", exact: true });
const sources = (page: Page) => page.getByRole("group", { name: "Fonte das músicas", exact: true });
const available = (page: Page) =>
  page.getByRole("status").filter({ hasText: /^\d+ músicas disponíveis$/ });

test("members vote with full lists; counts and personal choices stay in sync", async ({
  browser,
  page,
}) => {
  const code = await createRoomAs(page, "Ana");
  const { page: member } = await joinRoomAs(browser, code, "Bia");
  await expect(votes(member).getByRole("button")).toHaveCount(22);
  await expect(sources(member)).toHaveCount(0);
  await expect(
    member.getByText("Nenhum gênero marcado: vai tocar o Baralho da galera."),
  ).toBeVisible();
  await votes(member).getByRole("button", { name: "Rock, 0 votos", exact: true }).click();
  await expect(
    votes(page).getByRole("button", { name: "Rock, 1 voto", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    votes(member).getByRole("button", { name: "Rock, 1 voto", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await votes(page).getByRole("button", { name: "Rock, 1 voto", exact: true }).click();
  await expect(
    votes(member).getByRole("button", { name: "Rock, 2 votos", exact: true }),
  ).toBeVisible();
  await votes(member).getByRole("button", { name: "Pop, 0 votos", exact: true }).click();
  await expect(
    votes(member).getByRole("button", { name: "Pop, 1 voto", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await votes(member).getByRole("button", { name: "Rock, 2 votos", exact: true }).click();
  await expect(
    votes(member).getByRole("button", { name: "Rock, 1 voto", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    votes(member).getByRole("button", { name: "Pop, 1 voto", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(list(member).getByRole("button", { name: "Rock", exact: true })).toBeDisabled();
  await expect(decades(member).getByRole("button").first()).toBeDisabled();
  await expect(member.getByRole("button", { name: "Iniciar partida" })).toHaveCount(0);
});

test("the owner overrides genres and returns to following votes", async ({ browser, page }) => {
  const code = await createRoomAs(page, "Ana");
  const { page: member } = await joinRoomAs(browser, code, "Bia");
  await votes(member).getByRole("button", { name: "Rock, 0 votos", exact: true }).click();
  await expect(list(page).getByRole("button", { name: "Rock", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await list(page).getByRole("button", { name: "Rock", exact: true }).click();
  await expect(page.getByRole("button", { name: "Seguir votos" })).toBeVisible();
  await expect(
    page.getByText("Nenhum gênero marcado: vai tocar o Baralho da galera."),
  ).toBeVisible();
  await list(page).getByRole("button", { name: "Pop", exact: true }).click();
  await expect(list(member).getByRole("button", { name: "Pop", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(list(member).getByRole("button", { name: "Rock", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Seguir votos" }).click();
  await expect(list(page).getByRole("button", { name: "Rock", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(list(page).getByRole("button", { name: "Pop", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("button", { name: "Seguir votos" })).toHaveCount(0);
});

test("decades change availability, keep one selection and disable empty genres accessibly", async ({
  browser,
  page,
}) => {
  const code = await createRoomAs(page, "Ana");
  const { page: member } = await joinRoomAs(browser, code, "Bia");
  await votes(page).getByRole("button", { name: "Rock, 0 votos", exact: true }).click();
  await expect(list(page).getByRole("button", { name: "Rock", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await list(page).getByRole("button", { name: "MPB", exact: true }).click();
  await expect(list(page).getByRole("button", { name: "MPB", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const before = await available(page).innerText();
  await expect(decades(page).getByRole("button", { name: /^Antes dos 60s,/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await decades(page)
    .getByRole("button", { name: /^Anos 80,/ })
    .click();
  await expect(available(page)).not.toHaveText(before);
  await expect(available(member)).toHaveText(await available(page).innerText());
  await expect(decades(member).getByRole("button", { name: /^Anos 80,/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recomeçar músicas" })).toHaveCount(0);
  for (const label of ["Anos 70", "Anos 90", "Anos 2000", "Anos 2010", "Anos 2020"]) {
    await decades(page)
      .getByRole("button", { name: new RegExp(`^${label},`) })
      .click();
    await expect(page.getByRole("button", { name: "Iniciar partida" })).toBeEnabled();
  }
  const last = decades(page).getByRole("button", { name: /^Anos 60,/ });
  await expect(last).toBeDisabled();
  await expect(last).toHaveAttribute("aria-pressed", "true");
  await expect(last).toHaveAccessibleDescription("Mantenha pelo menos uma época marcada.");
  // The catalog has genres without tracks in the 1960s; their reason must be exposed.
  const disabledGenres = votes(page).locator("button:disabled");
  expect(await disabledGenres.count()).toBeGreaterThan(0);
  await expect(disabledGenres.first()).toHaveAccessibleDescription(
    "Sem músicas disponíveis nas épocas marcadas.",
  );
  // An owner can remove a selected genre after the decade filter empties it.
  const emptySelection = list(page).getByRole("button", { name: "MPB", exact: true });
  await expect(emptySelection).toBeEnabled();
  await emptySelection.click();
  await expect(emptySelection).toHaveAttribute("aria-pressed", "false");
  await expect(available(page)).toBeVisible();
  expect((await peekRoom(code)).lobby.decades).toEqual(["1960s"]);
});

test("Baralho da galera hides genre controls and starts a real game; Playlist opens import", async ({
  page,
}) => {
  const code = await createRoomAs(page, "Ana");
  await sources(page).getByRole("button", { name: "Baralho da galera", exact: true }).click();
  await expect(
    sources(page).getByRole("button", { name: "Baralho da galera", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(votes(page)).toHaveCount(0);
  await expect(list(page)).toHaveCount(0);
  await expect(decades(page)).toBeVisible();
  await expect(available(page)).toBeVisible();
  await openPlaylistImport(page);
  // Opening the import flow does not select an unimported playlist.
  await expect(
    sources(page).getByRole("button", { name: "Playlist", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/tiny");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(
    sources(page).getByRole("button", { name: "Playlist", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/· 3 músicas/)).toBeVisible();
  await page.getByRole("button", { name: "Usar Baralho da galera" }).click();
  await expect(page.getByLabel("Link da playlist")).toHaveCount(0);
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  await expect(page.getByRole("button", { name: "Puxar carta" })).toBeVisible();
  expect((await peekRoom(code)).lobby.source).toBe("galera");
  await expect(page.getByRole("heading", { name: "Lobby", exact: true })).toHaveCount(0);
});

for (const error of ["not-owner", "game-running", "invalid-input"] as const) {
  test(`rejected genre ack (${error}) shows a translated toast and keeps the server selection`, async ({
    page,
  }) => {
    await page.routeWebSocket(/socket\.io/, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((message) => {
        const vote = /^42(\d+)\["lobby:vote-genres",/.exec(message.toString());
        if (vote) socket.send(`43${vote[1]}[{"ok":false,"error":"${error}"}]`);
        else server.send(message);
      });
    });
    await createRoomAs(page, "Ana");
    await votes(page).getByRole("button", { name: "Rock, 0 votos", exact: true }).click();
    const messages = {
      "not-owner": "Só o dono da sala pode fazer isso.",
      "game-running": "Já tem uma partida rolando.",
      "invalid-input": "Confere os dados e tenta de novo.",
    };
    await expect(page.getByText(messages[error], { exact: true })).toBeVisible();
    await expect(
      votes(page).getByRole("button", { name: "Rock, 0 votos", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Iniciar partida" })).toBeEnabled();
  });
}

test("pending filters respond immediately, preserve rapid choices and leave other controls enabled", async ({
  page,
}) => {
  let hold = false;
  let release = () => {};
  let disconnect = () => {};
  await page.routeWebSocket(/socket\.io/, (socket) => {
    const server = socket.connectToServer();
    const messages: (string | Buffer)[] = [];
    socket.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (hold) messages.push(message);
      else socket.send(message);
    });
    release = () => {
      hold = false;
      for (const message of messages.splice(0)) socket.send(message);
    };
    disconnect = () => socket.close();
  });
  await createRoomAs(page, "Ana");
  hold = true;
  const rock = votes(page).getByRole("button", { name: "Rock, 0 votos", exact: true });
  const before = await rock.boundingBox();
  await rock.click();
  await expect(rock).toBeEnabled();
  await expect(rock).toHaveAttribute("aria-pressed", "true");
  await expect(votes(page)).toHaveAttribute("aria-busy", "true");
  expect((await rock.boundingBox())?.width).toBe(before?.width);
  await expect(sources(page).getByRole("button").first()).toBeEnabled();
  await expect(decades(page).getByRole("button").first()).toBeEnabled();
  await expect(page.getByRole("combobox", { name: "Jogo da sala" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Iniciar partida" })).toBeEnabled();
  const pop = votes(page).getByRole("button", { name: "Pop, 0 votos", exact: true });
  await pop.click();
  await rock.click();
  await expect(pop).toHaveAttribute("aria-pressed", "true");
  await expect(rock).toHaveAttribute("aria-pressed", "false");
  release();
  await expect(votes(page)).toHaveAttribute("aria-busy", "false");
  await expect(votes(page).getByRole("button", { name: /^Pop,/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(votes(page).getByRole("button", { name: /^Rock,/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("button", { name: "Iniciar partida" })).toBeEnabled();
  disconnect();
  await expect(page.getByRole("button", { name: "Iniciar partida" })).toBeDisabled();
  await expect(votes(page).getByRole("button").first()).toBeDisabled();
});

test("owner and member lobby screenshots, focus and accessibility at 390px and 1440px", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  const code = await createRoomAs(page, "Ana");
  const { page: member } = await joinRoomAs(browser, code, "Bia");
  await votes(page).getByRole("button", { name: "Rock, 0 votos", exact: true }).click();
  await expect(
    votes(member).getByRole("button", { name: "Rock, 1 voto", exact: true }),
  ).toBeVisible();
  for (const width of [390, 1440]) {
    for (const theme of ["dark", "light"] as const) {
      for (const [role, screen] of [
        ["owner", page],
        ["member", member],
      ] as const) {
        await screen.setViewportSize({ width, height: 900 });
        await screen.evaluate((value) => {
          document.documentElement.classList.toggle("dark", value === "dark");
          localStorage.setItem("theme", value);
        }, theme);
        const rock = votes(screen).getByRole("button", { name: "Rock, 1 voto", exact: true });
        await rock.focus();
        await screen.keyboard.press("Tab");
        await screen.keyboard.press("Shift+Tab");
        await expect(rock).toBeFocused();
        expect(await rock.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
        await expect(screen.getByTestId("route-surface")).toHaveCSS("opacity", "1");
        expect(
          await screen.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        expect(
          (await screen.getByRole("region", { name: "Lobby", exact: true }).boundingBox())?.width,
        ).toBeLessThanOrEqual(960);
        await expectNoAxeViolations(screen);
        const lobby = screen.getByRole("region", { name: "Lobby", exact: true });
        // The room scrolls inside main; expand height so the capture includes the whole lobby.
        const bounds = await lobby.boundingBox();
        await screen.setViewportSize({
          width,
          height: Math.max(900, Math.ceil((bounds?.y ?? 0) + (bounds?.height ?? 900) + 80)),
        });
        await screen.getByRole("main").evaluate((main) => {
          main.scrollTop = 0;
          for (const node of main.querySelectorAll("*")) node.scrollTop = 0;
        });
        await screen.addStyleTag({ content: "nextjs-portal { display: none; }" });
        await screen.screenshot({
          path: path.join(UI_DIR, `${role}-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
});
