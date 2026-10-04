"use client";

import { roomCodeSchema } from "@resenhark/shared";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { JoinForm } from "@/components/join-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createRoom } from "@/lib/api";
import { saveSession } from "@/lib/session";

export function HomeActions() {
  const router = useRouter();
  const codeId = useId();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  function enterWithCode(event: React.FormEvent) {
    event.preventDefault();
    const parsed = roomCodeSchema.safeParse(code.trim());
    if (!parsed.success) {
      setCodeError("O código tem 5 letras");
      return;
    }
    router.push(`/sala/${parsed.data}`);
  }

  return (
    <div className="flex flex-col gap-12">
      {creating ? (
        <section aria-labelledby="create-heading" className="flex flex-col gap-6">
          <h2 id="create-heading" className="text-xl leading-7 font-semibold">
            Criar sala
          </h2>
          <JoinForm
            submitLabel="Criar e entrar"
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              const room = await createRoom(input);
              saveSession(room.code, {
                memberId: room.memberId,
                sessionToken: room.sessionToken,
                name: input.name,
              });
              router.push(`/sala/${room.code}`);
            }}
          />
        </section>
      ) : (
        <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-end sm:gap-6">
          <Button onClick={() => setCreating(true)}>Criar sala</Button>
          <form onSubmit={enterWithCode} noValidate className="flex items-end gap-2">
            <Field data-invalid={!!codeError} className="w-40">
              <FieldLabel htmlFor={codeId}>Código da sala</FieldLabel>
              <Input
                id={codeId}
                value={code}
                maxLength={5}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCDE"
                className="font-mono uppercase"
                aria-invalid={!!codeError || undefined}
                aria-describedby={codeError ? `${codeId}-error` : undefined}
                onChange={(event) => {
                  setCode(event.target.value);
                  setCodeError(null);
                }}
              />
              {codeError ? <FieldError id={`${codeId}-error`}>{codeError}</FieldError> : null}
            </Field>
            <Button type="submit" variant="outline">
              Entrar com código
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
