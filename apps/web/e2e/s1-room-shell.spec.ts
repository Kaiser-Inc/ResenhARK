import { expect, test } from "@playwright/test";
import { createRoomAs, expectNoAxeViolations, twoMembersInRoom } from "./support";

test("both members appear online in the sidebar and survive a reload", async ({ browser }) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  const people = ana.getByRole("list", { name: "Pessoas na sala" });
  await expect(people.getByText("Ana")).toBeVisible();
  await expect(people.getByText("Bia")).toBeVisible();
  await expect(people.getByLabel("Dono da sala")).toBeVisible();
  await expect(people.getByText("offline")).toHaveCount(0);
  await bia.reload();
  await expect(bia.getByRole("list", { name: "Pessoas na sala" }).getByText("Bia")).toBeVisible();
  await expect(bia.getByLabel("Seu nome")).toHaveCount(0); // back without asking for a name
});

test("closing the second browser marks the member offline", async ({ browser }) => {
  const { ana, biaContext } = await twoMembersInRoom(browser);
  const people = ana.getByRole("list", { name: "Pessoas na sala" });
  const biaRow = people.getByRole("listitem").filter({ hasText: "Bia" });
  await expect(biaRow.getByText("offline")).toHaveCount(0);
  await biaContext.close();
  await expect(biaRow.getByText("offline")).toBeVisible();
});

test("reconnecting banner shows while the socket is down", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await expect(page.getByRole("list", { name: "Pessoas na sala" })).toBeVisible();
  await expect(page.getByText("Reconectando…")).toHaveCount(0);

  await page.context().setOffline(true);
  await expect(page.getByRole("status").getByText("Reconectando…")).toBeVisible();

  await page.context().setOffline(false);
  await expect(page.getByText("Reconectando…")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("list", { name: "Pessoas na sala" }).getByText("Ana")).toBeVisible();
});

test("copy link puts the room URL in the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await createRoomAs(page, "Ana");
  await page.getByRole("button", { name: "Copiar link" }).click();
  await expect(page.getByText("Link copiado")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test("a stale session for a missing room ends in room not found", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "resenhark:session:ZZZZZ",
      JSON.stringify({ memberId: "gone", sessionToken: "gone" }),
    ),
  );
  await page.goto("/sala/ZZZZZ");
  await expect(page.getByRole("heading", { name: "Sala não encontrada" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("resenhark:session:ZZZZZ"))).toBeNull();
});

test("a stale session for an existing room goes back to the join form", async ({
  page,
  browser,
}) => {
  const ana = await browser.newPage();
  const code = await createRoomAs(ana, "Ana");
  await page.addInitScript((key) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ memberId: "gone", sessionToken: "gone" }));
    }
  }, `resenhark:session:${code}`);
  await page.goto(`/sala/${code}`);
  await expect(page.getByLabel("Seu nome")).toBeVisible();
});

test("on mobile the people list opens in a sheet from the top bar", async ({ browser }) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  await bia.setViewportSize({ width: 390, height: 844 });
  // Below lg the sidebar is hidden: the list lives behind the menu button.
  await expect(bia.getByRole("list", { name: "Pessoas na sala" })).toHaveCount(0);
  await bia.getByRole("button", { name: "Abrir menu" }).click();
  const people = bia.getByRole("dialog").getByRole("list", { name: "Pessoas na sala" });
  await expect(people.getByText("Ana")).toBeVisible();
  await expect(people.getByText("Bia")).toBeVisible();
  await expect(ana.getByRole("list", { name: "Pessoas na sala" })).toBeVisible();
});

test("room shell has no serious accessibility violations", async ({ browser }) => {
  const { ana } = await twoMembersInRoom(browser);
  await expectNoAxeViolations(ana);
});
