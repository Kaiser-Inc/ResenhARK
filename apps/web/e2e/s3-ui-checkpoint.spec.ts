import {
  chooseOption,
  createRoomAs,
  expect,
  importDeckAndStart,
  joinRoomAs,
  setTheme,
  shot,
  test,
} from "./support";

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
] as const;

/** Screenshots for the slice 3 UI checkpoint; they live in .dev-flow/.../ui. */
for (const viewport of VIEWPORTS) {
  for (const theme of ["dark", "light"] as const) {
    test(`ui checkpoint ${viewport.name} ${theme}`, async ({ browser, page }) => {
      test.setTimeout(120_000);
      const name = (screen: string) => `s3-${screen}-${viewport.name}-${theme}`;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setTheme(page, theme);

      // Delay server messages while `slow` is set, to catch the importing state.
      let slow = false;
      await page.routeWebSocket(/socket\.io/, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((m) => server.send(m));
        server.onMessage((m) => {
          if (slow) setTimeout(() => ws.send(m), 2_000);
          else ws.send(m);
        });
      });

      const code = await createRoomAs(page, "Ana");
      await expect(page.getByLabel("Link da playlist")).toBeVisible();
      await shot(page, name("lobby-empty"));

      await page.getByLabel("Link da playlist").fill("isso nao e link");
      await page.getByRole("button", { name: "Importar playlist" }).click();
      await expect(page.getByText("Link inválido")).toBeVisible();
      await shot(page, name("lobby-error"));

      slow = true;
      await page.getByLabel("Link da playlist").fill("https://open.spotify.com/playlist/dev");
      await page.getByRole("button", { name: "Importar playlist" }).click();
      await expect(page.locator('[data-slot="button"][data-loading]')).toBeVisible();
      await shot(page, name("lobby-importing"));
      slow = false;
      await expect(page.getByText("40 faixas prontas")).toBeVisible({ timeout: 10_000 });
      await shot(page, name("lobby-imported"));

      await chooseOption(page, "Cartas para vencer", "30");
      await expect(page.getByText(/Playlist pequena/)).toBeVisible();
      await shot(page, name("lobby-small-playlist"));

      const bia = await joinRoomAs(browser, code, "Bia");
      await bia.page.setViewportSize({ width: viewport.width, height: viewport.height });
      await bia.page.evaluate((value) => localStorage.setItem("theme", value), theme);
      await bia.page.reload();
      await expect(bia.page.getByText("Aguardando Ana iniciar")).toBeVisible();
      await shot(bia.page, name("lobby-member"));
      await bia.context.close(); // offline members are not dealt in: Ana plays alone

      await chooseOption(page, "Cartas para vencer", "30");
      await page.getByRole("button", { name: "Iniciar partida" }).click();
      await expect(page.getByRole("button", { name: "Puxar carta" })).toBeVisible();
      await shot(page, name("turn-start"));

      // Play turns until both a hit and a miss were seen.
      const seen = new Set<string>();
      for (let turn = 0; turn < 25 && seen.size < 2; turn++) {
        await page.getByRole("button", { name: "Puxar carta" }).click();
        const gaps = page.getByRole("button", { name: /Inserir/ });
        await gaps.first().waitFor();
        const pick = Math.floor(Math.random() * (await gaps.count()));
        await gaps.nth(pick).click();
        if (turn === 0) await shot(page, name("guessing"));
        await page.getByRole("button", { name: "Travar palpite" }).click();
        const reveal = page.getByRole("region", { name: "Virada" });
        await expect(reveal).toContainText(/acertou|errou/);
        const hit = /acertou/.test(await reveal.innerText());
        const key = hit ? "hit" : "miss";
        if (!seen.has(key)) {
          seen.add(key);
          await shot(page, name(`reveal-${key}`));
        }
        await expect(page.getByRole("button", { name: "Puxar carta" })).toBeVisible();
      }

      // Random guesses: fail loudly if a run never produced both outcomes.
      expect([...seen].sort()).toEqual(["hit", "miss"]);

      await page.getByRole("button", { name: "Encerrar partida" }).click();
      await page.getByRole("button", { name: "Encerrar", exact: true }).click();
      await expect(page.getByRole("region", { name: "Resultado" })).toBeVisible();
      await shot(page, name("result"));
    });
  }
}
