import { checkpoint } from "./round-3-support";
import { chooseOption, createRoomAs, expect, joinRoomAs, setTheme, test } from "./support";

for (const game of ["Hitline", "Huehint"] as const) {
  test(`CA-F9: ${game} rules start closed and track owner settings for every member`, async ({
    page,
    browser,
  }) => {
    const code = await createRoomAs(page, "Ana");
    if (game === "Huehint") await chooseOption(page, "Jogo da sala", game);
    const { page: member, context } = await joinRoomAs(browser, code, "Bia");
    for (const participant of [page, member]) {
      const toggle = participant.getByRole("button", { name: `Como jogar ${game}` });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(participant.getByRole("list", { name: `Regras do ${game}` })).toHaveCount(0);
      await toggle.focus();
      await toggle.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(participant.getByRole("list", { name: `Regras do ${game}` })).toBeVisible();
    }
    await chooseOption(
      page,
      game === "Hitline" ? "Cartas para vencer" : "Voltas por jogador",
      game === "Hitline" ? "7" : "4",
    );
    for (const participant of [page, member]) {
      await expect(participant.getByRole("list", { name: "Configuração atual" })).toContainText(
        game === "Hitline" ? "Vence com 7 cartas" : "Voltas por jogador: 4",
      );
    }
    await page.reload();
    await expect(page.getByRole("button", { name: `Como jogar ${game}` })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await context.close();
  });

  test(`CA-F10: ${game} rules sheet traps focus, closes with Esc and works for spectators`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const code = await createRoomAs(page, "Ana");
    if (game === "Huehint") await chooseOption(page, "Jogo da sala", game);
    await page.getByRole("button", { name: "Iniciar partida" }).click();
    const trigger = page.getByRole("button", { name: "Regras", exact: true });
    await trigger.focus();
    await trigger.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Regras", exact: true });
    await expect(sheet.getByRole("list", { name: `Regras do ${game}` })).toBeVisible();
    await checkpoint(page, `5-rules-${game.toLowerCase()}`, async () => {
      // Crossing the mobile breakpoint remounts the board; open the sheet in that layout.
      if (!(await sheet.isVisible())) await trigger.click();
      await expect
        .poll(() => sheet.evaluate((node) => node.contains(document.activeElement)))
        .toBe(true);
      for (let n = 0; n < 8; n++) {
        await page.keyboard.press(n % 2 ? "Shift+Tab" : "Tab");
        await expect
          .poll(() => sheet.evaluate((node) => node.contains(document.activeElement)))
          .toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.press("Enter");
      await expect(sheet).toBeVisible();
    });
    await page.keyboard.press("Escape");
    const { page: spectator, context } = await joinRoomAs(browser, code, "Bia");
    await expect(
      spectator.getByText("Você está assistindo. Entra na próxima partida."),
    ).toBeVisible();
    await spectator.getByRole("button", { name: "Regras", exact: true }).click();
    await expect(spectator.getByRole("dialog", { name: "Regras", exact: true })).toContainText(
      game,
    );
    await context.close();
  });
}

test("CA-F13: game colors stay within the chroma limit and have 4.5:1 text contrast", async ({
  page,
}) => {
  const report: string[] = [];
  for (const theme of ["dark", "light"] as const) {
    await setTheme(page, theme);
    await page.goto("/");
    const results = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas unavailable");
      const luminance = (token: string) => {
        ctx.fillStyle = css.getPropertyValue(token).trim();
        ctx.fillRect(0, 0, 1, 1);
        const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)).map((value) => {
          const s = value / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      };
      return ["--game-hitline", "--game-huehint"].map((token) => {
        const [hi, lo] = [luminance("--foreground"), luminance(token)].sort((a, b) => b - a);
        return {
          token,
          color: css.getPropertyValue(token).trim(),
          ratio: (hi + 0.05) / (lo + 0.05),
        };
      });
    });
    for (const { token, color, ratio } of results) {
      expect(ratio, `${theme} ${token}`).toBeGreaterThanOrEqual(4.5);
      const chroma = Number(color.match(/oklch\([\d.]+%?\s*([\d.]+)/)?.[1]);
      expect(chroma, `${theme} ${token}: ${color}`).toBeLessThanOrEqual(0.17);
      report.push(`${theme} ${token}: ${color}, ${ratio.toFixed(2)}:1`);
    }
  }
  console.log(report.join("\n"));
  await test
    .info()
    .attach("game-token-contrast", { body: report.join("\n"), contentType: "text/plain" });
});
