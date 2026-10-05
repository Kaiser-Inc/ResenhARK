import { CHAT_MAX_LENGTH, type ChatMessage } from "@resenhark/shared";

export function validateMessage(
  raw: unknown,
): { ok: true; text: string } | { ok: false; error: "invalid-message" } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length === 0 || text.length > CHAT_MAX_LENGTH) {
    return { ok: false, error: "invalid-message" };
  }
  return { ok: true, text };
}

export function systemMessage(text: string, id: string, at: number): ChatMessage {
  return { id, kind: "system", text, at };
}
