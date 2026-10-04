"use client";

import { CHAT_MAX_LENGTH, type ErrorCode } from "@resenhark/shared";
import { SendIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  disabled: boolean;
  onSend: (text: string) => Promise<{ ok: true } | { ok: false; error: ErrorCode }>;
};

export function ChatComposer({ disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const sending = useRef(false);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending.current) return;
    sending.current = true;
    try {
      const ack = await onSend(trimmed);
      if (ack.ok) setText("");
      else if (ack.error === "rate-limited") toast.error("Devagar aí");
      else toast.error("Não deu para enviar. Tenta de novo.");
    } finally {
      sending.current = false;
    }
  }

  return (
    <form
      className="flex items-end gap-2 px-4 pt-2 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="chat-composer" className="sr-only">
        Mensagem
      </label>
      {/* One line that grows up to four (field-sizing); Enter sends, Shift+Enter breaks the line. */}
      <Textarea
        id="chat-composer"
        rows={1}
        value={text}
        maxLength={CHAT_MAX_LENGTH}
        disabled={disabled}
        placeholder="Escreva uma mensagem"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void submit();
        }}
        className="max-h-[104px] min-h-8 overflow-y-auto py-1 md:max-h-[92px] md:py-1.5"
      />
      <Button type="submit" size="icon" aria-label="Enviar" disabled={disabled || !text.trim()}>
        <SendIcon aria-hidden="true" strokeWidth={1.75} />
      </Button>
    </form>
  );
}
