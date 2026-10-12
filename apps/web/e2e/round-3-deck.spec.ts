import { checkpoint } from "./round-3-support";
import { createRoomAs, expect, joinRoomAs, openPlaylistImport, peekRoom, test } from "./support";

test("CA-F8: default deck starts immediately and imported decks can be restored", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const code = await createRoomAs(page, "Ana");
  await page
    .getByRole("group", { name: "Fonte das músicas" })
    .getByRole("button", { name: "Baralho da galera", exact: true })
    .click();
  await openPlaylistImport(page);
  await expect(page.getByText("Baralho da galera · 500 músicas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar partida" })).toBeEnabled();
  await expect(
    page.getByText("Funciona com playlists do Spotify em que Kaiser é colaborador."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin do Spotify" })).toHaveCount(0);
  await expect(page.getByText(/SiteSpy|Codetalk|em breve/)).toHaveCount(0);
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/tiny");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(page.getByText(/· 3 músicas/)).toBeVisible();
  await expect(
    page.getByText(
      "Baralho pequeno para 1 jogador com 10 cartas para vencer: a partida pode acabar antes de alguém vencer",
    ),
  ).toBeVisible();
  await checkpoint(page, "4-deck");
  await page.getByRole("button", { name: "Usar Baralho da galera" }).click();
  await expect(page.getByText("Baralho da galera · 500 músicas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Usar Baralho da galera" })).toHaveCount(0);
  await expect(page.getByText(/Restam|Baralho pequeno/)).toHaveCount(0);
  const stored = await peekRoom(code);
  expect(stored.lobby.deck).toBeNull();
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  await expect(page.getByRole("button", { name: "Puxar carta" })).toBeVisible();
});

test("CA-F8: members see the chosen deck but cannot import or restore it", async ({
  browser,
  page,
}) => {
  const code = await createRoomAs(page, "Ana");
  await openPlaylistImport(page);
  const { page: member, context } = await joinRoomAs(browser, code, "Bia");
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/tiny");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(member.getByText(/· 3 músicas/)).toBeVisible();
  await expect(
    member.getByRole("button", { name: /Importar playlist|Usar Baralho da galera/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Usar Baralho da galera" }).click();
  await expect(member.getByText("Baralho da galera · 500 músicas")).toBeVisible();
  await context.close();
});
