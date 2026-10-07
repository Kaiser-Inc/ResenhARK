import { checkpoint } from "./round-3-support";
import { expect, test } from "./support";

test("full Home motion survives the system preference and interrupted pointer gestures", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".hero-boat-sway")).toHaveCSS("animation-duration", "4.8s");
  await expect(page.locator(".hero-boat-float")).toHaveCSS("animation-name", "boat-float");
  const card = page.getByRole("button", { name: "Hitline", exact: true });
  await card.scrollIntoViewIfNeeded();
  await card.hover({ position: { x: 80, y: 80 } });
  const tilt = card.locator(".game-card-tilt");
  await expect
    .poll(() =>
      tilt.evaluate((node) => {
        const matrix = new DOMMatrix(getComputedStyle(node).transform);
        return Math.abs(matrix.m13) + Math.abs(matrix.m23);
      }),
    )
    .toBeGreaterThan(0.04);
  await page.mouse.move(0, 0);
  await expect
    .poll(() =>
      tilt.evaluate((node) => {
        const matrix = new DOMMatrix(getComputedStyle(node).transform);
        return Math.abs(matrix.m13) + Math.abs(matrix.m23);
      }),
    )
    .toBeLessThan(0.002);
  await checkpoint(page, "10-home-immersive");
});

test("room loading keeps depth and the animated brand with a reduced system preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release = () => {};
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rooms", async (route) => {
    await response;
    await route.fulfill({ status: 500, json: { error: "unknown" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala", exact: true }).click();
  await page.getByLabel("Seu nome").fill("Ana");
  await page.getByRole("button", { name: "Criar e entrar", exact: true }).click();
  const loading = page.getByRole("status", { name: "Carregamento da sala" });
  await expect(loading).toBeVisible();
  await expect(page.getByTestId("route-surface")).toHaveCSS("opacity", "0");
  await expect(page.getByTestId("route-surface")).not.toHaveCSS("transform", "none");
  await expect(loading.locator("[data-kaiser-mark]")).toHaveCount(1);
  await expect
    .poll(() =>
      loading
        .locator("[data-loading-boat]")
        .evaluate(
          (node) =>
            node.getAnimations().filter((animation) => animation.playState === "running").length,
        ),
    )
    .toBeGreaterThan(0);
  release();
  await expect(loading).toHaveCount(0);
  await expect(page.getByTestId("route-surface")).toHaveCSS("opacity", "1");
  await expect(page.getByTestId("route-surface")).toHaveCSS("transform", "none");
  await expect(page.getByLabel("Seu nome")).toHaveValue("Ana");
});
