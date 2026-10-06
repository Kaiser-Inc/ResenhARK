import { checkpoint } from "./round-3-support";
import {
  chooseOption,
  createRoomAs,
  expect,
  importDeckAndStart,
  peekRoom,
  test,
  writeRoom,
} from "./support";

test("CA-F2: Hitline offers exactly five winning sizes", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await page.getByRole("combobox", { name: "Cartas para vencer" }).click();
  await expect(page.getByRole("option")).toHaveText(["5", "7", "10", "12", "15"]);
  await page.keyboard.press("Escape");
  await chooseOption(page, "Cartas para vencer", "15");
  await expect(
    page
      .getByRole("combobox", { name: "Cartas para vencer" })
      .locator('[data-slot="select-value"]'),
  ).toHaveText("15");
});

test("CA-F4/F5/F6: fifteen cards scroll with the page and keep actions on screen", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const code = await createRoomAs(page, "Ana");
  await importDeckAndStart(page, "15");
  await page.getByRole("button", { name: "Puxar carta" }).click();
  const room = await peekRoom(code);
  const player = room.game.state.players[0];
  player.timeline = Array.from({ length: 15 }, (_, i) => ({
    ...player.timeline[0],
    id: `layout-${i}`,
    year: 1960 + i,
  }));
  room.game.state.turnDeadline = Date.now() + 120_000;
  await writeRoom(code, room);
  await page.reload();
  const timeline = page.getByRole("list", { name: "Timeline de Ana" });
  await expect(timeline.locator("[data-card-id]")).toHaveCount(15);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await timeline.evaluate((node) => getComputedStyle(node).overflowY)).toBe("visible");
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate(
        (value) =>
          window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * value),
        fraction,
      );
      const bounds = await page.locator(".hitline-actions").boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds?.y).toBeGreaterThanOrEqual(0);
      expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(901);
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await checkpoint(page, "2-hitline");
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`new cards scroll into view (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    const calls: string[] = [];
    await page.exposeFunction("recordScroll", (behavior: string) => calls.push(behavior));
    await page.addInitScript(() => {
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (this.hasAttribute("data-card-id") && typeof options === "object") {
          void (window as unknown as { recordScroll(value: string): Promise<void> }).recordScroll(
            options.behavior ?? "auto",
          );
        }
        return original.call(this, options);
      };
    });
    const code = await createRoomAs(page, "Ana");
    await importDeckAndStart(page, "10");
    // A purchase lands a public card without guessing hidden music.
    const room = await peekRoom(code);
    room.game.state.players[0].tokens = 3;
    await writeRoom(code, room);
    await page.reload();
    await page.getByRole("button", { name: "Comprar carta (3 fichas)" }).click();
    await expect.poll(() => calls).toContain(reducedMotion === "reduce" ? "instant" : "smooth");
  });
}
