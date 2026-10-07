import { checkpoint } from "./round-3-support";
import { expect, test } from "./support";

test("the official KaiserInc symbol assembles inside the sail on every home visit", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const boat = page.getByTestId("hero-boat");
  const bubble = boat.locator('[data-logo-piece="bubble"]');
  const mark = bubble.locator("[data-kaiser-mark]");
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveAttribute("viewBox", "0 0 204 200");
  await expect(mark.locator("path")).toHaveCount(5);
  await expect(mark.locator("circle")).toHaveCount(1);
  const pieces = mark.locator(".hero-kaiser-piece");
  await expect(pieces).toHaveCount(6);
  await expect(pieces.first()).toHaveCSS("animation-duration", "0.65s");
  await expect(pieces.last()).toHaveCSS("opacity", "1");
  await page.reload();
  await expect(pieces.first()).toHaveCSS("animation-duration", "0.65s");
  expect(await pieces.first().evaluate((node) => node.getAnimations()[0].currentTime)).toBeLessThan(
    1700,
  );
  await expect(pieces.last()).toHaveCSS("opacity", "1");
  await checkpoint(page, "9-home-kaiser-mark", async () => {
    const inside = await mark.evaluate((node) => {
      const path = node.parentElement?.querySelector("path");
      if (!path) return false;
      const outer = path.getBoundingClientRect();
      const inner = node.getBoundingClientRect();
      return (
        inner.left >= outer.left &&
        inner.right <= outer.right &&
        inner.top >= outer.top &&
        inner.bottom <= outer.bottom
      );
    });
    expect(inside).toBe(true);
    expect(
      await mark
        .locator("path")
        .first()
        .evaluate((node) => getComputedStyle(node).fill),
    ).not.toBe(await bubble.evaluate((node) => getComputedStyle(node).fill));
  });
});
