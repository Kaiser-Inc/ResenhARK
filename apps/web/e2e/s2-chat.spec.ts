import type { Locator, Page } from "@playwright/test";
import { createRoomAs, expect, expectNoAxeViolations, test, twoMembersInRoom } from "./support";

const composer = (page: Page) => page.getByRole("textbox", { name: "Mensagem" });
const thread = (page: Page) => page.getByRole("log", { name: "Mensagens" });

async function sendChat(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(composer(page)).toHaveValue("");
}

test("messages appear for both members, grouped, with clickable links", async ({ browser }) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  await sendChat(ana, "oi pessoal");
  await sendChat(ana, "tudo bem?");
  await sendChat(ana, "olha isso https://example.com/resenha");

  for (const page of [ana, bia]) {
    await expect(thread(page).getByText("oi pessoal")).toBeVisible();
    await expect(thread(page).getByText("tudo bem?")).toBeVisible();
    // Three messages in a row from Ana share one avatar and one name.
    await expect(thread(page).locator('[data-slot="chat-avatar"]')).toHaveCount(1);
    await expect(thread(page).getByText("Ana", { exact: true })).toHaveCount(1);
  }
  const link = thread(bia).getByRole("link", { name: "https://example.com/resenha" });
  await expect(link).toHaveAttribute("href", "https://example.com/resenha");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveAttribute("target", "_blank");

  // A different sender starts a new group.
  await sendChat(bia, "bora");
  await expect(thread(ana).getByText("bora")).toBeVisible();
  await expect(thread(ana).locator('[data-slot="chat-avatar"]')).toHaveCount(2);
});

test("an empty history shows the empty state", async ({ page }) => {
  // The server always posts "entrou" system messages, so hand the client an empty history.
  await page.routeWebSocket(/socket\.io/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      const frame = typeof message === "string" ? message : message.toString();
      if (/^42\d*\["chat:/.test(frame)) {
        if (frame.includes('"chat:history"')) ws.send('42["chat:history",[]]');
        return;
      }
      ws.send(message);
    });
  });
  await createRoomAs(page, "Ana");
  await expect(thread(page).getByText("Nenhuma mensagem ainda.")).toBeVisible();
});

test("script tags render as text", async ({ browser }) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  let dialogs = 0;
  bia.on("dialog", (dialog) => {
    dialogs += 1;
    void dialog.dismiss();
  });
  await sendChat(ana, "<script>alert(1)</script>");
  await expect(thread(bia).getByText("<script>alert(1)</script>")).toBeVisible();
  await expect(thread(bia).locator("script")).toHaveCount(0);
  expect(dialogs).toBe(0);
});

test("history survives a reload without duplicates", async ({ browser }) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  await sendChat(ana, "primeira");
  await sendChat(ana, "segunda");
  await expect(thread(bia).getByText("segunda")).toBeVisible();
  await bia.reload();
  await expect(thread(bia).getByText("primeira")).toHaveCount(1);
  await expect(thread(bia).getByText("segunda")).toHaveCount(1);
});

test("Shift+Enter breaks the line and the rate limit keeps the text in the field", async ({
  page,
}) => {
  await createRoomAs(page, "Ana");
  await composer(page).fill("linha 1");
  await composer(page).press("Shift+Enter");
  await composer(page).pressSequentially("linha 2");
  await expect(composer(page)).toHaveValue("linha 1\nlinha 2");
  await composer(page).press("Enter");
  await expect(composer(page)).toHaveValue("");
  await expect(thread(page).getByText(/linha 1\s*linha 2/)).toBeVisible();

  // 4 more fill the 5-per-5-seconds budget; the 6th is rejected.
  for (const n of [2, 3, 4, 5]) await sendChat(page, `msg ${n}`);
  await composer(page).fill("passou do limite");
  await composer(page).press("Enter");
  await expect(page.getByText("Devagar aí")).toBeVisible();
  await expect(composer(page)).toHaveValue("passou do limite");
});

test("owner removes a member", async ({ browser }) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  const biaRow = ana
    .getByRole("list", { name: "Pessoas na sala" })
    .getByRole("listitem")
    .filter({ hasText: "Bia" });

  // Only the owner gets a menu, and not on their own row.
  await expect(
    ana
      .getByRole("list", { name: "Pessoas na sala" })
      .getByRole("listitem")
      .filter({ hasText: "Ana" })
      .getByRole("button"),
  ).toHaveCount(0);
  await expect(bia.getByRole("button", { name: /^Opções de/ })).toHaveCount(0);

  await biaRow.getByRole("button", { name: "Opções de Bia" }).click();
  await ana.getByRole("menuitem", { name: "Remover da sala" }).click();
  const dialog = ana.getByRole("alertdialog");
  await expect(dialog.getByText("Remover Bia?")).toBeVisible();
  await expect(
    dialog.getByText("A pessoa pode voltar pelo código como alguém novo."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Remover" }).click();

  await expect(bia.getByRole("heading", { name: "Você foi removido da sala" })).toBeVisible();
  await expect(bia.getByRole("link", { name: "Voltar ao início" })).toBeVisible();
  expect(
    await bia.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("session"))),
  ).toEqual([]);
  await expect(biaRow).toHaveCount(0);
  await expect(thread(ana).getByText("Bia foi removido da sala")).toBeVisible();
});

test("leaving asks for confirmation, clears the session and goes home", async ({ browser }) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  await bia.getByRole("button", { name: "Sair da sala" }).click();
  const dialog = bia.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(bia.getByRole("list", { name: "Pessoas na sala" })).toBeVisible();

  await bia.getByRole("button", { name: "Sair da sala" }).click();
  await bia.getByRole("alertdialog").getByRole("button", { name: "Sair" }).click();
  await expect(bia).toHaveURL(/\/$/);
  expect(
    await bia.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("session"))),
  ).toEqual([]);
  await expect(
    ana.getByRole("list", { name: "Pessoas na sala" }).getByRole("listitem").filter({
      hasText: "Bia",
    }),
  ).toHaveCount(0);
  await expect(thread(ana).getByText("Bia saiu")).toBeVisible();
});

test("composer and room actions are disabled while reconnecting", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await expect(composer(page)).toBeEnabled();
  await page.context().setOffline(true);
  await expect(page.getByRole("status").getByText("Reconectando…")).toBeVisible();
  await expect(composer(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sair da sala" })).toBeDisabled();
  await page.context().setOffline(false);
  await expect(composer(page)).toBeEnabled({ timeout: 15_000 });
});

async function expectBox(locator: Locator, width: number) {
  const box = await locator.boundingBox();
  expect(box?.width).toBeCloseTo(width, 0);
}

test("layout: three columns at 1440, chat sheet at 1100, tabs at 390", async ({ page }) => {
  await createRoomAs(page, "Ana");
  const sidebar = page.getByRole("complementary", { name: "Painel da sala" });
  const chat = page.getByRole("region", { name: "Chat" });
  const chatButton = page.getByRole("button", { name: /^Chat/ });
  const tabs = page.getByRole("tablist");

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
  await expect(chat).toBeVisible();
  await expect(chatButton).toHaveCount(0);
  await expect(tabs).toHaveCount(0);
  await expectBox(sidebar, 240);
  await expectBox(chat, 360);

  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
  await expect(chat).toHaveCount(0);
  await chatButton.click();
  const sheet = page.getByRole("dialog", { name: "Chat" });
  await expect(sheet.getByRole("region", { name: "Chat" })).toBeVisible();
  await expect(composer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Jogo" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
  await expect(chat).toBeHidden();
  await tabs.getByRole("tab", { name: /^Chat/ }).click();
  await expect(chat).toBeVisible();
  await expect(composer(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lobby" })).toBeHidden();
});

test("unread badge counts messages while the chat tab is hidden on mobile", async ({ browser }) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  await bia.setViewportSize({ width: 390, height: 844 });
  const chatTab = bia.getByRole("tab", { name: /^Chat/ });
  await expect(chatTab).toBeVisible();
  await expect(bia.getByRole("tab", { name: "Jogo" })).toHaveAttribute("aria-selected", "true");

  await sendChat(ana, "um");
  await sendChat(ana, "dois");
  await expect(chatTab).toContainText("2");

  await chatTab.click();
  await expect(thread(bia).getByText("dois")).toBeVisible();
  await expect(chatTab).not.toContainText("2");

  // Back on the game tab the count starts over.
  await bia.getByRole("tab", { name: "Jogo" }).click();
  await sendChat(ana, "tres");
  await expect(chatTab).toContainText("1");
});

test("unread count shows on the Chat button while the sheet is closed at 1100", async ({
  browser,
}) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  await bia.setViewportSize({ width: 1100, height: 900 });
  const button = bia.getByRole("button", { name: /^Chat/ });
  await sendChat(ana, "ping");
  await expect(button).toContainText("1");
  await button.click();
  await expect(bia.getByRole("dialog", { name: "Chat" }).getByText("ping")).toBeVisible();
  await bia.keyboard.press("Escape");
  await expect(button).not.toContainText("1");
});

test("room with chat has no serious accessibility violations", async ({ browser }) => {
  const { ana, bia } = await twoMembersInRoom(browser);
  await sendChat(ana, "olá https://example.com");
  await sendChat(bia, "e aí");
  // Both messages must remain fully readable after a new sender updates the thread.
  await expect(thread(ana).getByText("e aí", { exact: true })).toHaveCSS("opacity", "1");
  await expect(thread(ana).locator("p").filter({ hasText: "olá https://example.com" })).toHaveCSS(
    "opacity",
    "1",
  );
  await expectNoAxeViolations(ana);
  await ana.setViewportSize({ width: 390, height: 844 });
  await expectNoAxeViolations(ana);
});

test("a draft typed while a message is pending is kept", async ({ page }) => {
  await createRoomAs(page, "Ana");
  // Hold the server's reply to the send so the ack stays pending.
  await page.routeWebSocket(/socket\.io/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      const frame = typeof message === "string" ? message : message.toString();
      if (/^43\d*\[/.test(frame)) setTimeout(() => ws.send(message), 1500);
      else ws.send(message);
    });
  });
  await page.reload();
  await expect(composer(page)).toBeEnabled();
  await composer(page).fill("primeira");
  await composer(page).press("Enter");
  await composer(page).fill("rascunho novo");
  await expect(thread(page).getByText("primeira")).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(composer(page)).toHaveValue("rascunho novo");
});

test("confirm dialogs cannot be confirmed while offline", async ({ browser }) => {
  const { ana } = await twoMembersInRoom(browser);
  await ana.getByRole("button", { name: "Opções de Bia" }).click();
  await ana.getByRole("menuitem", { name: "Remover da sala" }).click();
  await expect(ana.getByRole("alertdialog").getByRole("button", { name: "Remover" })).toBeEnabled();
  await ana.context().setOffline(true);
  await expect(
    ana.getByRole("alertdialog").getByRole("button", { name: "Remover" }),
  ).toBeDisabled();
  await ana.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
  await ana.context().setOffline(false);
  await expect(composer(ana)).toBeEnabled({ timeout: 15_000 });
  await ana.getByRole("button", { name: "Sair da sala" }).click();
  await expect(ana.getByRole("alertdialog").getByRole("button", { name: "Sair" })).toBeEnabled();
  await ana.context().setOffline(true);
  await expect(ana.getByRole("alertdialog").getByRole("button", { name: "Sair" })).toBeDisabled();
});

test("composer has form attributes and the send button shows a pending state", async ({ page }) => {
  await createRoomAs(page, "Ana");
  await page.routeWebSocket(/socket\.io/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      const frame = typeof message === "string" ? message : message.toString();
      if (/^43\d*\[/.test(frame)) setTimeout(() => ws.send(message), 1000);
      else ws.send(message);
    });
  });
  await page.reload();
  await expect(composer(page)).toBeEnabled();
  await expect(composer(page)).toHaveAttribute("name", "message");
  await expect(composer(page)).toHaveAttribute("autocomplete", "off");
  await expect(composer(page)).toHaveAttribute("placeholder", "Escreva uma mensagem…");
  const send = page.getByRole("button", { name: "Enviar" });
  await composer(page).fill("oi");
  await composer(page).press("Enter");
  await expect(send).toHaveAttribute("aria-busy", "true");
  await expect(send).not.toHaveAttribute("aria-busy", "true");
});

test("scrollable log and tab panel are keyboard focusable with a visible focus ring", async ({
  page,
}) => {
  await createRoomAs(page, "Ana");
  await expect(thread(page)).toHaveAttribute("tabindex", "0");
  await page.setViewportSize({ width: 390, height: 844 });
  const chatTab = page.getByRole("tablist").getByRole("tab", { name: /^Chat/ });
  await chatTab.click();
  await chatTab.press("Tab");
  const panel = page.getByRole("tabpanel", { name: /^Chat/ });
  await expect(panel).toBeFocused();
  await expect(panel).toHaveCSS("outline-style", "solid");
});
