import type { Page } from "@playwright/test";
import { expect, peekDraw, startTwoPlayerGame, test } from "./support";

const row = (page: Page, name: string) =>
  page.getByRole("region", { name: "Placar" }).getByRole("listitem").filter({ hasText: name });

test("two players: guess, contest, reveal with marks and text", async ({ browser }) => {
  const { turn, other, turnName, otherName } = await startTwoPlayerGame(browser);
  await turn.getByRole("button", { name: "Puxar carta" }).click();
  await turn.getByLabel("Música").fill("zzz");
  await turn.getByLabel("Artista").fill("yyy");
  await turn
    .getByRole("button", { name: /Inserir/ })
    .first()
    .click();
  await turn.getByRole("button", { name: "Travar palpite" }).click();

  await expect(other.getByText("Contestar custa 1 ficha")).toBeVisible();
  await expect(other.getByText(`palpite de ${turnName}`)).toBeVisible();
  const free = other.getByRole("button", { name: /Inserir/ });
  await expect(free).toHaveCount(1);
  await free.click();

  for (const page of [turn, other]) {
    const reveal = page.getByRole("region", { name: "Virada" });
    const item = (text: string) => reveal.getByRole("listitem").filter({ hasText: text });
    await expect(reveal).toContainText(/\d{4}/);
    await expect(item("Música")).toContainText("errou");
    await expect(item("Artista")).toContainText("errou");
    await expect(item("Posição")).toContainText(/acertou|errou/);
    await expect(item(`${otherName} contestou`)).toContainText(/acertou|errou/);
    await expect(reveal.locator("svg.lucide-check, svg.lucide-x")).toHaveCount(4);
  }
});

test("skip shows the discarded card and costs a token", async ({ browser }) => {
  const { turn, other, turnName } = await startTwoPlayerGame(browser);
  await turn.getByRole("button", { name: "Puxar carta" }).click();
  await expect(row(turn, turnName)).toContainText("2 fichas");
  await turn.getByRole("button", { name: "Sortear outra (1 ficha)" }).click();
  for (const page of [turn, other]) {
    await expect(page.getByText(/Carta descartada: \d{4}/)).toBeVisible();
    await expect(row(page, turnName)).toContainText("1 ficha");
  }
});

test("buy is disabled with a reason after one purchase", async ({ browser }) => {
  const { code, turn, other, turnName } = await startTwoPlayerGame(browser);
  const buy = turn.getByRole("button", { name: "Comprar carta (3 fichas)" });
  await expect(buy).toBeDisabled();
  await expect(buy).toHaveAccessibleDescription("Sem fichas");

  // Turn 1: answer title and artist right to earn the third token.
  await turn.getByRole("button", { name: "Puxar carta" }).click();
  const card = await peekDraw(code);
  await turn.getByLabel("Música").fill(card.title);
  await turn.getByLabel("Artista").fill(card.artists[0]);
  await turn
    .getByRole("button", { name: /Inserir/ })
    .first()
    .click();
  await turn.getByRole("button", { name: "Travar palpite" }).click();
  await other.getByRole("button", { name: "Passar" }).click();
  await expect(row(turn, turnName)).toContainText("3 fichas");

  // Turn 2: the other player plays and the first one passes.
  await other.getByRole("button", { name: "Puxar carta" }).click();
  await other
    .getByRole("button", { name: /Inserir/ })
    .first()
    .click();
  await other.getByRole("button", { name: "Travar palpite" }).click();
  await turn.getByRole("button", { name: "Passar" }).click();

  await expect(buy).toBeEnabled();
  await buy.click();
  await expect(buy).toBeDisabled();
  await expect(buy).toHaveAccessibleDescription("Uma compra por vez");
  await expect(row(turn, turnName)).toContainText("0 fichas");
});

test("disabled actions explain themselves: offline and no slot chosen", async ({ browser }) => {
  const { turn } = await startTwoPlayerGame(browser);
  const draw = turn.getByRole("button", { name: "Puxar carta" });
  await expect(draw).toBeEnabled();
  await turn.context().setOffline(true);
  await expect(draw).toBeDisabled();
  await expect(draw).toHaveAccessibleDescription("Reconectando…");
  await turn.context().setOffline(false);
  await expect(draw).toBeEnabled({ timeout: 15_000 });

  await draw.click();
  const lock = turn.getByRole("button", { name: "Travar palpite" });
  await expect(lock).toBeDisabled();
  await expect(lock).toHaveAccessibleDescription("Escolha uma posição");
  await turn
    .getByRole("button", { name: /Inserir/ })
    .first()
    .click();
  await expect(lock).toBeEnabled();
});
