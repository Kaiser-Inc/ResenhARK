import { createRoomAs, expect, setTheme, shot, test } from "./support";

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
] as const;

/** Screenshots for the slice 6 UI checkpoint; they live in .dev-flow/.../ui. */
for (const viewport of VIEWPORTS) {
  for (const theme of ["dark", "light"] as const) {
    test(`ui checkpoint ${viewport.name} ${theme}`, async ({ page }) => {
      test.setTimeout(90_000);
      const name = (screen: string) => `s6-${screen}-${viewport.name}-${theme}`;
      await page.setViewportSize(viewport);
      await setTheme(page, theme);

      // The api rate-limits logins (5 per minute), so the admin screens run on mocked responses.
      let status = { connected: false, configured: false };
      await page.route("**/admin/login", async (route) => {
        const { password } = route.request().postDataJSON();
        await route.fulfill(
          password === "dev"
            ? { json: { adminToken: "mock" } }
            : { status: 401, json: { error: "invalid-password" } },
        );
      });
      await page.route("**/admin/spotify/status", (route) => route.fulfill({ json: status }));
      await page.goto("/admin/spotify");
      await shot(page, name("admin-login"));
      await page.getByLabel("Senha", { exact: true }).fill("wrong");
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page.getByText("Senha incorreta")).toBeVisible();
      await shot(page, name("admin-login-error"));
      await page.getByLabel("Senha", { exact: true }).fill("dev");
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page.getByText("Spotify não configurado no servidor")).toBeVisible();
      await shot(page, name("admin-not-configured"));
      for (const [screen, connected] of [
        ["admin-connected", true],
        ["admin-disconnected", false],
      ] as const) {
        status = { connected, configured: true };
        await page.reload();
        await expect(page.getByText(connected ? "Conectado" : "Desconectado")).toBeVisible();
        await shot(page, name(screen));
      }

      await createRoomAs(page, "Ana");
      for (const [screen, link, text] of [
        ["lobby-invalid", "https://open.spotify.com/album/abc", /^Link inválido/],
        ["lobby-no-access", "https://open.spotify.com/playlist/private", /^Sem acesso/],
        ["lobby-empty", "https://open.spotify.com/playlist/empty", /^Playlist vazia/],
      ] as const) {
        await page.getByLabel("Link da playlist").fill(link);
        await page.getByRole("button", { name: "Importar playlist" }).click();
        await expect(page.getByText(text)).toBeVisible();
        await shot(page, name(screen));
      }

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
        if ((await reveal.getByRole("img", { name: /QR code/ }).count()) > 0) break;
      }
      await expect(reveal.getByRole("img", { name: /QR code/ })).toBeVisible();
      await shot(page, name("reveal-qr"));
    });
  }
}
