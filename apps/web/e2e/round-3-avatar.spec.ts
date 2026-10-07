import { checkpoint } from "./round-3-support";
import { createRoomAs, expect, test } from "./support";

test("CA-F14: entry reacts to typing, a valid name, appearance changes, and validation errors", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala" }).click();
  const name = page.getByLabel("Seu nome");
  const face = page.getByTestId("avatar-preview").locator("[data-expression]");
  await expect(face).toHaveAttribute("data-expression", "idle");
  await name.pressSequentially("Ana", { delay: 80 });
  await expect(face).toHaveAttribute("data-expression", "thinking");
  await expect(face).toHaveAttribute("data-expression", "happy");
  await page.getByRole("radio", { name: "Coral", exact: true }).click();
  await expect(face).toHaveAttribute("data-expression", "love");
  await page.waitForTimeout(600);
  await page.getByRole("radio", { name: "Quadrada", exact: true }).click();
  await page.waitForTimeout(500);
  await expect(face).toHaveAttribute("data-expression", "love");
  await expect(face).toHaveAttribute("data-expression", "happy");
  await checkpoint(page, "7-avatar");
  await name.fill("");
  await page.getByRole("button", { name: "Criar e entrar" }).click();
  await expect(face).toHaveAttribute("data-expression", "sad");
  await expect(name).toBeFocused();
  await name.fill("Ana");
  await expect(face).toHaveAttribute("data-expression", "happy");
});

test("CA-F14: an API name collision shows sad and editing the name recovers", async ({
  page,
  browser,
}) => {
  const code = await createRoomAs(page, "Ana");
  const context = await browser.newContext();
  try {
    const guest = await context.newPage();
    await guest.goto(`/sala/${code}`);
    const name = guest.getByLabel("Seu nome");
    const face = guest.getByTestId("avatar-preview").locator("[data-expression]");
    await name.fill("Ana");
    await guest.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(guest.getByText("Nome já em uso nesta sala")).toBeVisible();
    await expect(face).toHaveAttribute("data-expression", "sad");
    await name.fill("Bia");
    await expect(face).toHaveAttribute("data-expression", "happy");
  } finally {
    await context.close();
  }
});

test("CA-F14: arrival is a one-second reaction and idle avatars never loop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createRoomAs(page, "Ana");
  const person = page
    .getByRole("list", { name: "Pessoas na sala" })
    .getByRole("listitem")
    .filter({ hasText: "Ana" });
  const face = person.locator("[data-expression]");
  await expect(face).toHaveAttribute("data-expression", "happy");
  await expect(face).toHaveAttribute("data-expression", "idle");
  await page.waitForTimeout(300);
  expect(
    await face.evaluate(
      (node) =>
        node
          .getAnimations({ subtree: true })
          .filter(
            (animation) => animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
          ).length,
    ),
  ).toBe(0);
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(face).toHaveAttribute("data-expression", "idle");
});

test("entry reactions keep their animation with a reduced system preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala" }).click();
  const face = page.getByTestId("avatar-preview").locator("[data-expression]");
  const pending = page.evaluate(async () => {
    let animated = false;
    for (let i = 0; i < 40; i++) {
      const face = document.querySelector('[data-testid="avatar-preview"] [data-expression]');
      animated ||= (face?.getAnimations({ subtree: true }).length ?? 0) > 0;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return animated;
  });
  await page.getByLabel("Seu nome").fill("Ana");
  await expect(face).toHaveAttribute("data-expression", "happy");
  await page.getByRole("radio", { name: "Rosa", exact: true }).click();
  await expect(face).toHaveAttribute("data-expression", "love");
  expect(await pending).toBe(true);
  await expect(face).toHaveAttribute("data-expression", "happy");
  await expect
    .poll(() => face.evaluate((node) => node.getAnimations({ subtree: true }).length))
    .toBe(0);
  await expect(face).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
});
