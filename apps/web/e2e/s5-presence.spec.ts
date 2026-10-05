import {
  createRoomAs,
  expect,
  importDeckAndStart,
  joinRoomAs,
  startTwoPlayerGame,
  test,
} from "./support";

test("offline turn player shows a waiting countdown", async ({ browser }) => {
  const { turn, other, turnName } = await startTwoPlayerGame(browser);
  await turn.context().close();
  const strip = other.getByText(new RegExp(`^Aguardando ${turnName} · \\d+s$`));
  await expect(strip).toBeVisible();
  await expect(other.getByRole("region", { name: "Placar" }).getByText("offline")).toBeVisible();
});

test("late joiner watches as spectator", async ({ browser, page: ana }) => {
  const code = await createRoomAs(ana, "Ana");
  await importDeckAndStart(ana, "10");
  await expect(ana.getByRole("button", { name: "Puxar carta" })).toBeVisible();
  const { page: caio } = await joinRoomAs(browser, code, "Caio");
  await expect(caio.getByText("Você está assistindo. Entra na próxima partida.")).toBeVisible();
  await expect(caio.getByRole("region", { name: "Placar" })).toBeVisible();
  await expect(caio.getByRole("button", { name: "Encerrar partida" })).toHaveCount(0);
  await expect(
    caio.getByRole("list", { name: "Pessoas na sala" }).getByText("espectador"),
  ).toBeVisible();
});

test("owner ends the game with confirmation and returns to the lobby", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await importDeckAndStart(page);
  await page.getByRole("button", { name: "Encerrar partida" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Encerrar a partida?");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("region", { name: "Resultado" })).toHaveCount(0);
  await page.getByRole("button", { name: "Encerrar partida" }).click();
  await page.getByRole("button", { name: "Encerrar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Resultado" })).toContainText(
    "Partida encerrada pelo dono.",
  );
  await page.getByRole("button", { name: "Outra rodada" }).click();
  await expect(page.getByRole("button", { name: "Iniciar partida" })).toBeVisible();
});

test("an empty pile ends the game with the tiebreak explained", async ({ page }) => {
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
  // The pile is only found empty when the next card is drawn.
  await page.getByRole("button", { name: "Puxar carta" }).click();
  const result = page.getByRole("region", { name: "Resultado" });
  await expect(result).toContainText("Fim da pilha");
  await expect(result).toContainText("mais cartas, depois mais fichas");
  await expect(result).toContainText("vitória é dividida");
});
