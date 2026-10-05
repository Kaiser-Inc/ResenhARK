import { createRoomAs, expect, expectNoAxeViolations, test } from "./support";

test("admin login shows the connection status", async ({ page }) => {
  await page.goto("/admin/spotify");
  await page.getByLabel("Senha", { exact: true }).fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Desconectado")).toBeVisible();
  // The e2e api has no Spotify credentials, so there is nothing to connect to.
  await expect(page.getByText("Spotify não configurado no servidor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar Spotify" })).toHaveCount(0);
  await expectNoAxeViolations(page);
  // Reload keeps the session (sessionStorage only).
  await page.reload();
  await expect(page.getByText("Desconectado")).toBeVisible();
});

test("wrong admin password shows an error on the field", async ({ page }) => {
  await page.goto("/admin/spotify");
  await page.getByLabel("Senha", { exact: true }).fill("nope");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Senha incorreta")).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("aria-invalid", "true");
});

test("callback status in the url shows a toast", async ({ page }) => {
  await page.goto("/admin/spotify?status=error");
  await expect(page.getByText("Conexão cancelada")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/spotify$/);
});

test("lobby shows the invalid link message", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/album/abc");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(
    page.getByText("Link inválido. Cole o link de uma playlist do Spotify."),
  ).toBeVisible();
});

test("lobby shows the no access and empty messages", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/private");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(
    page.getByText("Sem acesso a esta playlist. Adicione Kaiser como colaborador."),
  ).toBeVisible();
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/empty");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await expect(page.getByText(/^Playlist vazia/)).toBeVisible();
});

test("reveal shows a QR code next to the Spotify link when the card has one", async ({ page }) => {
  await createRoomAs(page, "Ana");
  // The tiny deck has 3 cards and 2 carry a link, so one of the first two draws has it.
  await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/tiny");
  await page.getByRole("button", { name: "Importar playlist" }).click();
  await page.getByRole("button", { name: "Iniciar partida" }).click();
  const reveal = page.getByRole("region", { name: "Virada" });
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Puxar carta" }).click();
    await page
      .getByRole("button", { name: /Inserir/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Travar palpite" }).click();
    await expect(reveal).toBeVisible();
    if ((await reveal.getByRole("link", { name: /Ouvir no Spotify/ }).count()) > 0) break;
  }
  await expect(reveal.getByRole("link", { name: /Ouvir no Spotify/ })).toBeVisible();
  const qr = reveal.getByRole("img", { name: "QR code para ouvir no Spotify" });
  await expect(qr).toBeVisible();
  expect(await qr.boundingBox()).toMatchObject({ width: 96, height: 96 });
});

async function loggedInWithMocks(page: import("@playwright/test").Page, authorizeUrl: string) {
  await page.addInitScript(() => sessionStorage.setItem("resenhark:admin-token", "mock"));
  await page.route("**/admin/spotify/status", (route) =>
    route.fulfill({ json: { connected: false, configured: true } }),
  );
  await page.route("**/admin/spotify/authorize", (route) =>
    route.fulfill({ json: { authorizeUrl } }),
  );
}

test("connect refuses an authorize url that is not the Spotify consent page", async ({ page }) => {
  await loggedInWithMocks(page, "https://evil.example/authorize");
  await page.goto("/admin/spotify");
  await page.getByRole("button", { name: "Conectar Spotify" }).click();
  await expect(page.getByText("Não deu para conectar. Tenta de novo.")).toBeVisible();
  await expect(page).toHaveURL(/localhost:4000\/admin\/spotify$/);
});

test("connect follows a Spotify authorize url", async ({ page }) => {
  await loggedInWithMocks(page, "https://accounts.spotify.com/authorize?client_id=x");
  await page.route("https://accounts.spotify.com/**", (route) =>
    route.fulfill({ body: "spotify consent", contentType: "text/plain" }),
  );
  await page.goto("/admin/spotify");
  await page.getByRole("button", { name: "Conectar Spotify" }).click();
  await expect(page).toHaveURL(/^https:\/\/accounts\.spotify\.com\/authorize/);
});

test("a 401 on status clears the token and shows the login form", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("resenhark:admin-token", "stale"));
  await page.route("**/admin/spotify/status", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthorized" } }),
  );
  await page.goto("/admin/spotify");
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("resenhark:admin-token"))).toBeNull();
});
