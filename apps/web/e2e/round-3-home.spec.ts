import { checkpoint } from "./round-3-support";
import { createRoomAs, expect, test } from "./support";

for (const reduced of [false, true])
  test(`Home CTA scrambles, handles interrupted hover and opens the form (${reduced ? "reduced" : "full"} motion)`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await page.goto("/");
    const button = page.locator(".home-create-room");
    const label = page.getByTestId("create-room-label");
    await expect(label).toHaveText("Criar sala");
    await button.hover();
    await expect(label).not.toHaveText(/^(Criar sala|Começar a resenha!)$/);
    await expect(label).toHaveText("Começar a resenha!");
    await expect(button).toHaveAccessibleName("Começar a resenha!");
    const angle = () =>
      button.evaluate((node) =>
        getComputedStyle(node, "::after").getPropertyValue("--home-create-angle"),
      );
    const firstAngle = await angle();
    await expect.poll(angle).not.toBe(firstAngle);
    expect(
      await button.evaluate((node) => Number.parseFloat(getComputedStyle(node, "::after").top)),
    ).toBeLessThan(0);
    await page.mouse.move(0, 0);
    await button.hover();
    await page.mouse.move(0, 0);
    await expect(label).toHaveText("Criar sala");
    await expect(button).toHaveAccessibleName("Criar sala");
    await button.hover();
    await button.click();
    await expect(page.getByLabel("Seu nome", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(label).toHaveText("Criar sala");
  });

test("CA-F11: approved hero, actions, steps and cards adapt to desktop and mobile", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const title = page.getByRole("heading", { name: "Qual vai ser a resenha de hoje?", exact: true });
  await expect(title).toBeVisible();
  await expect(page.getByText("Sala de jogos do time", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(
      "Crie uma sala, mande o código pro time e joguem juntos. Sem cadastro, direto do navegador.",
    ),
  ).toBeVisible();
  for (const step of ["Crie a sala", "Compartilhe o código", "Escolha o jogo"])
    await expect(page.getByRole("heading", { name: step, exact: true })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const create = await page
      .getByRole("button", { name: "Criar sala", exact: true })
      .boundingBox();
    const code = await page.getByLabel("Código da sala", { exact: true }).boundingBox();
    const enter = await page.getByRole("button", { name: "Entrar", exact: true }).boundingBox();
    expect(create).not.toBeNull();
    expect(code).not.toBeNull();
    expect(enter).not.toBeNull();
    expect(Math.abs((enter?.y ?? 0) - (code?.y ?? 1))).toBeLessThan(1);
    expect(create?.y).toBeGreaterThan((code?.y ?? 0) + (code?.height ?? 0));
    expect(create?.width).toBeCloseTo((enter?.x ?? 0) + (enter?.width ?? 0) - (code?.x ?? 0), 0);
  }
  const boat = await page.getByTestId("hero-boat").boundingBox();
  const heading = await title.boundingBox();
  expect(boat?.x).toBeGreaterThan((heading?.x ?? 0) + (heading?.width ?? 0));
  await checkpoint(page, "6-home");
  await page.setViewportSize({ width: 390, height: 900 });
  const metrics = await title.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    line: Number.parseFloat(getComputedStyle(node).lineHeight),
  }));
  expect(metrics.height / metrics.line).toBeCloseTo(2, 1);
  expect((await page.getByTestId("hero-boat").boundingBox())?.y).toBeLessThan(
    (await title.boundingBox())?.y ?? 0,
  );
});

test("CA-F12: both cards flip with Enter and Space and expose only their current face", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  for (const game of ["Hitline", "Huehint"]) {
    const card = page.getByRole("button", { name: game, exact: true });
    const rules = card.getByRole("list", { name: `Regras do ${game}` });
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await expect(rules).toHaveCount(0);
    await card.focus();
    await card.press("Enter");
    await expect(card).toHaveCSS("outline-style", "solid");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(rules).toBeVisible();
    await expect(card).toHaveAccessibleDescription(
      game === "Hitline" ? /Toca um trecho de música/ : /Na sua vez, só você vê uma cor/,
    );
    await expect(card.locator('[data-face="front"]')).toHaveAttribute("aria-hidden", "true");
    expect(
      await card
        .locator('[data-face="back"]')
        .evaluate((node) => node.scrollHeight <= node.clientHeight),
    ).toBe(true);
    await card.press("Space");
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await expect(rules).toHaveCount(0);
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
  }
  await checkpoint(page, "6-cards-back");
});

test("CA-F12: touch flips without hover", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 900 },
  });
  const page = await context.newPage();
  await page.goto("/");
  const card = page.getByRole("button", { name: "Huehint", exact: true });
  await card.tap();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await card.tap();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await context.close();
});

test("immersive motion keeps the boat and card flips with a reduced system preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value === "dark"),
      theme,
    );
    for (const part of [".hero-boat-sway", ".hero-boat-waves"])
      expect(
        await page.locator(part).evaluate((node) => getComputedStyle(node).animationName),
      ).not.toBe("none");
    const card = page.getByRole("button", { name: "Hitline", exact: true });
    const next = (await card.getAttribute("aria-pressed")) !== "true";
    await card.click();
    expect(
      await card.locator(".game-card-inner").evaluate((node) => getComputedStyle(node).transform),
    ).not.toBe("none");
    const visible = card.locator(`[data-face="${next ? "back" : "front"}"]`);
    await expect(visible).toHaveCSS("opacity", "1");
    await expect(card.locator(".game-card-inner")).toHaveCSS("transition-duration", "0.28s");
    await expect(card.locator(".game-card-inner")).toHaveCSS("transition-property", "transform");
  }
});

test("the boat follows a continuous wave with a visible five-degree sway", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/");
  const sway = page.locator(".hero-boat-sway");
  await expect(sway).toHaveCSS("animation-duration", "4.8s");
  await expect(sway).toHaveCSS("animation-iteration-count", "infinite");
  const angles: number[] = [];
  for (let n = 0; n < 12; n++) {
    const angle = await sway.evaluate((node) => {
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return Math.abs((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI);
    });
    angles.push(angle);
    expect(angle).toBeLessThanOrEqual(5.01);
    await page.waitForTimeout(400);
  }
  expect(Math.max(...angles)).toBeGreaterThan(3);
});

test("CA-F15: home has metadata and a static boat image, room and admin stay noindex", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("ResenhARK | Sala de jogos do time");
  const description =
    "Crie uma sala, mande o código pro time e joguem juntos. Sem cadastro, direto do navegador.";
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", description);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Qual vai ser a resenha de hoje?",
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    description,
  );
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    "ResenhARK navegando",
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
  const imageUrl = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(imageUrl).toBeTruthy();
  const response = await page.request.get(new URL(imageUrl as string).pathname);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect((await response.body()).length).toBeGreaterThan(1000);
  await createRoomAs(page, "Ana");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await page.goto("/admin/spotify");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});
