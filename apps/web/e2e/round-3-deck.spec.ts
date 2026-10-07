import { checkpoint } from "./round-3-support";
import { createRoomAs, expect, joinRoomAs, peekRoom, test } from "./support";

test("CA-F8: default deck starts immediately and imported decks can be restored", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const code = await createRoomAs(page, "Ana");
  await expect(page.getByText("Baralho ResenhARK · 500 músicas")).toBeVisible();
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
  await page.getByRole("button", { name: "Voltar ao baralho ResenhARK" }).click();
  await expect(page.getByText("Baralho ResenhARK · 500 músicas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Voltar ao baralho ResenhARK" })).toHaveCount(0);
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
  const { page: member, context } = await joinRoomAs(browser, code, "Bia");
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/tiny");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(member.getByText(/· 3 músicas/)).toBeVisible();
  await expect(
    member.getByRole("button", { name: /Importar playlist|Voltar ao baralho ResenhARK/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar ao baralho ResenhARK" }).click();
  await expect(member.getByText("Baralho ResenhARK · 500 músicas")).toBeVisible();
  await context.close();
});
