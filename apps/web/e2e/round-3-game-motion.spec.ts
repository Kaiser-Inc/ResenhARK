import { chooseOption, createRoomAs, expect, test } from "./support";

test("room creation closes the Home, waits for the server and opens the room", async ({ page }) => {
  let release = () => {};
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rooms", async (route) => {
    await response;
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala", exact: true }).click();
  await page.getByLabel("Seu nome").fill("Ana");
  await page.getByRole("button", { name: "Criar e entrar", exact: true }).click();
  const loading = page.getByRole("status", { name: "Carregamento da sala" });
  await expect(loading).toBeVisible();
  await expect(page.getByTestId("route-surface")).toHaveCSS("opacity", "0");
  await expect(page.getByTestId("route-surface")).toHaveAttribute("inert", "");
  release();
  await expect(page).toHaveURL(/\/sala\/[A-HJKMNP-Z]{5}$/);
  await expect(page.getByRole("list", { name: "Pessoas na sala" })).toBeVisible();
  await expect(loading).toHaveCount(0);
  await expect(page.getByTestId("route-surface")).toHaveCSS("opacity", "1");
  await expect(page.getByTestId("route-surface")).toHaveCSS("transform", "none");
  await expect(page.getByTestId("route-surface")).not.toHaveAttribute("inert");
});

test("failed room creation restores the Home and preserves the name", async ({ page }) => {
  await page.route("**/rooms", (route) =>
    route.fulfill({ status: 500, json: { error: "unknown" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala", exact: true }).click();
  await page.getByLabel("Seu nome").fill("Ana");
  await page.getByRole("button", { name: "Criar e entrar", exact: true }).click();
  await expect(page.getByText("Não deu certo. Tenta de novo.")).toBeVisible();
  await expect(page.getByRole("status", { name: "Carregamento da sala" })).toHaveCount(0);
  await expect(page.getByTestId("route-surface")).toHaveCSS("opacity", "1");
  await expect(page.getByLabel("Seu nome")).toHaveValue("Ana");
  await expect(page.getByRole("button", { name: "Criar e entrar", exact: true })).toBeEnabled();
});

for (const reduced of [false, true])
  test(`Huehint reveals colors and scores (${reduced ? "reduced" : "full"} motion)`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await createRoomAs(page, "Ana");
    await chooseOption(page, "Jogo da sala", "Huehint");
    await chooseOption(page, "Voltas por jogador", "2");
    await page.getByRole("button", { name: "Iniciar partida" }).click();
    await page.getByRole("button", { name: "Confirmar palpite" }).click();
    const reveal = page.getByRole("region", { name: "Revelação da rodada 1", exact: true });
    await expect(reveal).toBeVisible();
    for (const part of ["hue-real", "hue-guess", "hue-score"]) {
      await expect(reveal.locator(`[data-motion="${part}"]`)).toBeVisible();
      await expect(reveal.locator(`[data-motion="${part}"]`)).toHaveCSS("opacity", "1");
      await expect(reveal.locator(`[data-motion="${part}"]`)).toHaveCSS(
        "transform",
        "matrix(1, 0, 0, 1, 0, 0)",
      );
    }
    await page.getByRole("button", { name: "Próxima cor" }).click();
    await expect(page.getByRole("region", { name: "Cor secreta" })).toBeVisible();
    await expect(reveal).toHaveCount(0);
  });
