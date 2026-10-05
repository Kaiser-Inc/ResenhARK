import { createRoomAs, expect, importDeckAndStart, peekDraw, peekRoom, test } from "./support";

test("another round: lobby counts the remaining songs and nothing played is dealt again", async ({
  page,
}) => {
  const code = await createRoomAs(page, "Ana");
  await importDeckAndStart(page, "2");

  // Solo, N=2: the drawn card must land in the right gap to win.
  await page.getByRole("button", { name: "Puxar carta" }).click();
  const card = await peekDraw(code);
  const [start] = (await peekRoom(code)).game.state.players[0].timeline;
  await page.getByLabel("Música").fill(card.title);
  await page.getByLabel("Artista").fill(card.artists[0]);
  const gaps = page.getByRole("button", { name: /Inserir/ });
  await (card.year >= start.year ? gaps.last() : gaps.first()).click();
  await page.getByRole("button", { name: "Travar palpite" }).click();
  const result = page.getByRole("region", { name: "Resultado" });
  await expect(result).toContainText("Ana venceu");
  const round1 = (await peekRoom(code)).game.state.players[0].timeline.map(
    (c: { title: string }) => c.title,
  );
  expect(round1).toHaveLength(2);

  await result.getByRole("button", { name: "Outra rodada" }).click();
  await expect(page.getByText("Restam 38 de 40 músicas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Recomeçar músicas" })).toBeVisible();

  await page.getByRole("button", { name: "Iniciar partida" }).click();
  await page.getByRole("button", { name: "Puxar carta" }).click();
  const state = (await peekRoom(code)).game.state;
  // The drawn card is still the head of the deck.
  const seen: string[] = [
    ...state.players[0].timeline.map((c: { title: string }) => c.title),
    ...state.deck.map((c: { title: string }) => c.title),
  ];
  expect(seen).toHaveLength(38);
  for (const title of round1) expect(seen).not.toContain(title);
});

test("Recomeçar músicas brings every song back", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await importDeckAndStart(page, "2");
  await page.getByRole("button", { name: "Encerrar partida" }).click();
  await page.getByRole("button", { name: "Encerrar", exact: true }).click();
  await page.getByRole("button", { name: "Outra rodada" }).click();
  await expect(page.getByText("Restam 39 de 40 músicas")).toBeVisible();
  await page.getByRole("button", { name: "Recomeçar músicas" }).click();
  await expect(page.getByText(/^Restam /)).toHaveCount(0);
  await expect(page.getByText("40 faixas prontas")).toBeVisible();
});
