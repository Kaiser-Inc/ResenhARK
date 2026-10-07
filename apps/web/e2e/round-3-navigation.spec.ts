import { checkpoint } from "./round-3-support";
import { createRoomAs, expect, test } from "./support";

for (const width of [390, 1440]) {
  test(`CA-F7: room logo goes home directly from lobby (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await createRoomAs(page, "Ana");
    await page.getByRole("link", { name: "ResenhARK, início" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test(`CA-F7: game logo asks, cancels with focus, then goes home (${width})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const code = await createRoomAs(page, "Ana");
    await page.getByRole("button", { name: "Iniciar partida" }).click();
    await expect(page.getByRole("region", { name: "Hitline" })).toBeVisible();
    const logo = page.getByRole("link", { name: "ResenhARK, início" });
    await logo.click();
    const dialog = page.getByRole("alertdialog", { name: "Sair da sala?" });
    await expect(dialog).toContainText(
      `A partida continua sem você. Para voltar, use o código ${code}.`,
    );
    if (width === 1440) {
      await checkpoint(page, "3-navigation");
      await page.setViewportSize({ width, height: 900 });
    }
    await page.getByRole("button", { name: "Ficar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/sala/${code}$`));
    await expect(logo).toBeFocused();
    await logo.press("Enter");
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
}
