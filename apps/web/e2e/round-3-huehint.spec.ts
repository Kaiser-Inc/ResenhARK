import { checkpoint } from "./round-3-support";
import { chooseOption, createRoomAs, expect, joinRoomAs, test } from "./support";

test("CA-F1/F2: fixed Huehint options in both themes and viewports", async ({ page }) => {
  test.setTimeout(60_000);
  await createRoomAs(page, "Ana");
  await chooseOption(page, "Jogo da sala", "Huehint");
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value === "dark"),
      theme,
    );
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [label, values] of [
        ["Tempo da dica", [15, 20, 30, 45, 60, 90]],
        ["Tempo de palpite", [20, 30, 45, 60, 90, 120]],
        ["Voltas por jogador", [1, 2, 3, 4, 5]],
      ] as const) {
        await page.getByRole("combobox", { name: label }).click();
        await expect(page.getByRole("option")).toHaveText(
          values.map((n) => `${n}${label.startsWith("Tempo") ? " s" : ""}`),
        );
        const list = page.getByRole("listbox");
        expect(await list.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
        await page.keyboard.press("Escape");
      }
    }
  }
  await checkpoint(page, "1-huehint-lobby");
});

test("CA-F3: Enter and click advance solo reveal immediately, including the final round", async ({
  page,
}) => {
  test.setTimeout(65_000);
  await createRoomAs(page, "Ana");
  await chooseOption(page, "Jogo da sala", "Huehint");
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  for (let round = 1; round <= 5; round++) {
    await expect(page.getByRole("button", { name: "Próxima cor" })).toHaveCount(0);
    await page.getByRole("button", { name: "Confirmar palpite" }).click();
    await expect(page.getByRole("button", { name: "Próxima cor" })).toBeVisible();
    if (round === 1) await checkpoint(page, "1-huehint-reveal");
    const started = Date.now();
    if (round % 2) {
      await page.getByRole("region", { name: "Huehint", exact: true }).focus();
      await page.keyboard.press("Enter");
    } else await page.getByRole("button", { name: "Próxima cor" }).click();
    if (round < 5)
      await expect(page.getByText(`Rodada ${round + 1} / 5`, { exact: true })).toBeVisible({
        timeout: 4000,
      });
    else
      await expect(page.getByRole("region", { name: "Placar final" })).toBeVisible({
        timeout: 4000,
      });
    expect(Date.now() - started).toBeLessThan(4000);
  }
});

test("CA-F3: group reveal never offers next color", async ({ page, browser }) => {
  const code = await createRoomAs(page, "Ana");
  const { page: bia } = await joinRoomAs(browser, code, "Bia");
  await chooseOption(page, "Jogo da sala", "Huehint");
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  await expect
    .poll(
      async () =>
        (await page.getByLabel("Sua dica", { exact: true }).isVisible()) ||
        (await bia.getByLabel("Sua dica", { exact: true }).isVisible()),
    )
    .toBe(true);
  const giver = (await page.getByLabel("Sua dica", { exact: true }).isVisible()) ? page : bia;
  const guesser = giver === page ? bia : page;
  await giver.getByLabel("Sua dica", { exact: true }).fill("Vermelho McQueen");
  await giver.getByRole("button", { name: "Enviar dica" }).click();
  await guesser.getByRole("button", { name: "Confirmar palpite" }).click();
  for (const member of [giver, guesser]) {
    await expect(
      member.getByRole("region", { name: "Revelação da rodada 1", exact: true }),
    ).toBeVisible();
    await expect(member.getByRole("button", { name: "Próxima cor" })).toHaveCount(0);
  }
});
