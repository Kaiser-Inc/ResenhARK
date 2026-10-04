import { HUES, SHAPES } from "@resenhark/shared";
import { expect, expectNoAxeViolations, test } from "./support";

test("create a room, then a second browser joins through the link", async ({ browser }) => {
  const ana = await browser.newPage();
  await ana.goto("/");
  await ana.getByRole("button", { name: "Criar sala" }).click();
  await ana.getByLabel("Seu nome").fill("Ana");
  await ana.getByRole("button", { name: "Criar e entrar" }).click();
  await expect(ana).toHaveURL(/\/sala\/[A-HJKMNP-Z]{5}$/);
  const url = ana.url();

  const bia = await (await browser.newContext()).newPage();
  await bia.goto(url);
  await bia.getByLabel("Seu nome").fill("ana");
  await bia.getByRole("button", { name: "Entrar" }).click();
  await expect(bia.getByText("Nome já em uso nesta sala")).toBeVisible();
  await bia.getByLabel("Seu nome").fill("Bia");
  await bia.getByRole("button", { name: "Entrar" }).click();
  await expect(bia.getByText("Bia", { exact: true })).toBeVisible();
});

test("enter with a room code from the home page", async ({ page, browser }) => {
  const ana = await browser.newPage();
  await ana.goto("/");
  await ana.getByRole("button", { name: "Criar sala" }).click();
  await ana.getByLabel("Seu nome").fill("Ana");
  await ana.getByRole("button", { name: "Criar e entrar" }).click();
  await expect(ana).toHaveURL(/\/sala\/[A-HJKMNP-Z]{5}$/);
  const code = ana.url().split("/").pop() as string;

  await page.goto("/");
  await page.getByLabel("Código da sala").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Entrar com código" }).click();
  await expect(page).toHaveURL(new RegExp(`/sala/${code}$`));
  await expect(page.getByLabel("Seu nome")).toBeVisible();
});

test("unknown code shows room not found", async ({ page }) => {
  await page.goto("/sala/ZZZZZ");
  await expect(page.getByRole("heading", { name: "Sala não encontrada" })).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao início" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("a server error is not shown as a missing room, and retry recovers", async ({
  page,
  browser,
}) => {
  const ana = await browser.newPage();
  await ana.goto("/");
  await ana.getByRole("button", { name: "Criar sala" }).click();
  await ana.getByLabel("Seu nome").fill("Ana");
  await ana.getByRole("button", { name: "Criar e entrar" }).click();
  await expect(ana).toHaveURL(/\/sala\/[A-HJKMNP-Z]{5}$/);
  const code = ana.url().split("/").pop() as string;

  let failing = true;
  await page.route(`**/rooms/${code}`, (route) =>
    failing ? route.fulfill({ status: 500, body: "boom" }) : route.continue(),
  );
  await page.goto(`/sala/${code}`);
  await expect(
    page.getByRole("heading", { name: "Não deu para falar com o servidor." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sala não encontrada" })).toHaveCount(0);

  failing = false;
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByLabel("Seu nome")).toBeVisible();
});

test("avatar picker changes the preview for every shape and hue", async ({ page }) => {
  // CA-F10: the preview SVG is different for each of the 10 shapes and each of the 8 hues.
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala" }).click();
  await page.getByLabel("Seu nome").fill("Ana");
  const preview = page.getByTestId("avatar-preview");
  const shapes = page.getByRole("radiogroup", { name: "Forma" }).getByRole("radio");
  const hues = page.getByRole("radiogroup", { name: "Cor" }).getByRole("radio");
  await expect(shapes).toHaveCount(SHAPES.length);
  await expect(hues).toHaveCount(HUES.length);

  const shapeMarkup: string[] = [];
  for (let i = 0; i < SHAPES.length; i++) {
    await shapes.nth(i).click();
    await expect(shapes.nth(i)).toBeChecked();
    shapeMarkup.push(await preview.innerHTML());
  }
  expect(new Set(shapeMarkup).size).toBe(SHAPES.length);

  const hueMarkup: string[] = [];
  for (let i = 0; i < HUES.length; i++) {
    await hues.nth(i).click();
    await expect(hues.nth(i)).toBeChecked();
    hueMarkup.push(await preview.innerHTML());
  }
  expect(new Set(hueMarkup).size).toBe(HUES.length);
});

test("avatar picker options move with the arrow keys", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala" }).click();
  const shapes = page.getByRole("radiogroup", { name: "Forma" }).getByRole("radio");
  await shapes.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(shapes.nth(1)).toBeFocused();
  await expect(shapes.nth(1)).toBeChecked();
});

test("home and join form have no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Criar sala" }).click();
  await expectNoAxeViolations(page);
});

test("opening the create form focuses the name field, cancelling returns focus to the button", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala" }).click();
  await expect(page.getByLabel("Seu nome")).toBeFocused();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("button", { name: "Criar sala" })).toBeFocused();
});

test("pressing d does not toggle the theme", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Criar sala" }).focus();
  await page.keyboard.press("d");
  await expect(html).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await expect(html).not.toHaveClass(/dark/);
});

test("validation errors move focus to the invalid field", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala" }).click();
  await page.getByRole("button", { name: "Criar e entrar" }).click();
  await expect(page.getByText("Escreva um nome de até 20 letras")).toBeVisible();
  await expect(page.getByLabel("Seu nome")).toBeFocused();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Entrar com código" }).click();
  await expect(page.getByText("O código tem 5 letras")).toBeVisible();
  await expect(page.getByLabel("Código da sala")).toBeFocused();
});

test("pages have descriptive titles and a header landmark", async ({ page }) => {
  await page.goto("/sala/ZZZZZ");
  await expect(page).toHaveTitle("Sala ZZZZZ | ResenhARK");
  await expect(page.getByRole("banner")).toBeVisible();
});
