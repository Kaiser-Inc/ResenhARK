import AxeBuilder from "@axe-core/playwright";
import { checkpoint } from "./round-3-support";
import { expect, peekDraw, peekRoom, startTwoPlayerGame, test, writeRoom } from "./support";

for (const reduced of [false, true])
  test(`another player sees revealed songs and the brief highlight (${reduced ? "reduced" : "full"} motion)`, async ({
    browser,
  }) => {
    const { code, turn, other, turnName } = await startTwoPlayerGame(browser);
    await other.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await turn.getByRole("button", { name: "Puxar carta", exact: true }).click();
    const card = await peekDraw(code);
    const cardId = (await peekRoom(code)).game.state.draw.card.id;
    const starter = Number(
      (
        await turn.getByRole("list", { name: `Timeline de ${turnName}`, exact: true }).innerText()
      ).match(/\d{4}/)?.[0],
    );
    await turn
      .getByRole("button", { name: /Inserir/ })
      .nth(card.year >= starter ? 1 : 0)
      .click();
    await turn.getByLabel("Música").fill(card.title);
    await turn.getByLabel("Artista").fill(card.artists[0]);
    await turn.getByRole("button", { name: "Travar palpite", exact: true }).click();
    await other.getByRole("button", { name: "Passar", exact: true }).click();
    const scoreboard = other.getByRole("region", { name: "Placar", exact: true });
    const toggle = scoreboard.getByRole("button", { name: new RegExp(`^${turnName} cartas`) });
    await toggle.click();
    const timeline = scoreboard.getByRole("list", { name: `Timeline de ${turnName}`, exact: true });
    const row = timeline.locator(`[data-card-id="${cardId}"]`);
    await expect(row).toHaveClass(/bg-accent/);
    await expect(row).toContainText(`${card.title} · ${card.artists.join(", ")}`);
    await expect(row.locator("[title]")).toHaveAttribute(
      "title",
      `${card.title} · ${card.artists.join(", ")}`,
    );
    expect(await timeline.evaluate((node) => node.tagName)).toBe("OL");
    await expect(timeline.getByText(/Inserir/)).toHaveCount(0);
    if (reduced) await expect(row).toHaveCSS("transform", "none");
    await expect(row).not.toHaveClass(/bg-accent/);
    const { violations } = await new AxeBuilder({ page: other }).analyze();
    expect(violations).toEqual([]);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(timeline).toHaveCount(0);

    const owner = turnName === "Ana" ? turn : other;
    await owner.getByRole("button", { name: "Encerrar partida", exact: true }).click();
    await owner.getByRole("button", { name: "Encerrar", exact: true }).click();
    const result = other.getByRole("region", { name: "Resultado", exact: true });
    await expect(
      result.getByRole("list", { name: `Timeline de ${turnName}`, exact: true }),
    ).toContainText(`${card.title} · ${card.artists.join(", ")}`);
  });

test("fifteen public songs and empty timelines fit both themes without an inner scroll", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { code, turn, other, turnName, otherName } = await startTwoPlayerGame(browser);
  const room = await peekRoom(code);
  const owner = room.game.state.players[room.game.state.turn];
  const empty = room.game.state.players.find((player: { id: string }) => player.id !== owner.id);
  owner.timeline = Array.from({ length: 15 }, (_, index) => ({
    ...owner.timeline[0],
    id: `public-timeline-${index}`,
    year: 1970 + index,
    title: `A long song title that needs truncation on a narrow screen ${index + 1}`,
    artists: ["First Artist", "Second Artist"],
  }));
  empty.timeline = [];
  room.game.state.config.targetCards = 15;
  room.game.state.turnDeadline = Date.now() + 120_000;
  await writeRoom(code, room);
  await other.reload();
  const scoreboard = other.getByRole("region", { name: "Placar", exact: true });
  const emptyToggle = scoreboard.getByRole("button", { name: new RegExp(`^${otherName} cartas`) });
  await emptyToggle.click();
  await expect(
    scoreboard.getByRole("list", { name: `Timeline de ${otherName}`, exact: true }),
  ).toHaveText("Sem cartas");
  const toggle = scoreboard.getByRole("button", { name: new RegExp(`^${turnName} cartas`) });
  await toggle.click();
  await expect(emptyToggle).toHaveAttribute("aria-expanded", "false");
  await checkpoint(
    other,
    "8-player-timelines",
    async () => {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      const timeline = scoreboard.getByRole("list", {
        name: `Timeline de ${turnName}`,
        exact: true,
      });
      await expect(timeline.locator("[data-card-id]")).toHaveCount(15);
      expect(
        await timeline.evaluate((node) => ({
          overflow: getComputedStyle(node).overflowY,
          fullHeight: node.scrollHeight <= node.clientHeight,
        })),
      ).toEqual({ overflow: "visible", fullHeight: true });
      await expect(timeline.getByText(/Inserir/)).toHaveCount(0);
    },
    {
      animations: "allow",
      fitPage: true,
      afterCapture: async () => {
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await expect(
          scoreboard
            .getByRole("list", { name: `Timeline de ${turnName}`, exact: true })
            .locator("[data-card-id]"),
        ).toHaveCount(15);
      },
    },
  );
  const roomOwner = turnName === "Ana" ? turn : other;
  await roomOwner.getByRole("button", { name: "Encerrar partida", exact: true }).click();
  await roomOwner.getByRole("button", { name: "Encerrar", exact: true }).click();
  const result = other.getByRole("region", { name: "Resultado", exact: true });
  await checkpoint(other, "8-player-timelines-result", async () => {
    const timeline = result.getByRole("list", { name: `Timeline de ${turnName}`, exact: true });
    await expect(timeline.locator("[data-card-id]")).toHaveCount(15);
    await expect(
      result.getByRole("list", { name: `Timeline de ${otherName}`, exact: true }),
    ).toHaveText("Sem cartas");
  });
});
