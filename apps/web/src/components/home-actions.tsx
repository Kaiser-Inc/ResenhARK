"use client";

import { roomCodeSchema } from "@resenhark/shared";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

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
  const createRef = useRef<HTMLButtonElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const wasCreating = useRef(false);

  // The create button unmounts while the form is open; hand focus back to it on cancel.
  useEffect(() => {
    if (wasCreating.current && !creating) createRef.current?.focus();
    wasCreating.current = creating;
  }, [creating]);

  function enterWithCode(event: React.FormEvent) {
    event.preventDefault();
    const parsed = roomCodeSchema.safeParse(code.trim());
    if (!parsed.success) {
      setCodeError("O código tem 5 letras");
      codeRef.current?.focus();
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
            focusOnMount
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
        // One grid, three explicit rows on sm+: label / controls / feedback. The form and the Field
        // are `display: contents`, so their children sit in the grid and the error row never
        // moves the controls. Below sm everything stacks in DOM order.
        <div className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-[auto_10rem_auto] sm:grid-rows-[auto_auto_auto] sm:items-center sm:gap-x-6">
          <Button
            ref={createRef}
            className="mb-6 justify-self-start sm:col-start-1 sm:row-start-2 sm:mb-0"
            onClick={() => setCreating(true)}
          >
            Criar sala
          </Button>
          <form onSubmit={enterWithCode} noValidate className="contents">
            <Field data-invalid={!!codeError} className="contents">
              <FieldLabel htmlFor={codeId} className="sm:col-start-2 sm:row-start-1">
                Código da sala
              </FieldLabel>
              <Input
                ref={codeRef}
                id={codeId}
                name="code"
                value={code}
                maxLength={5}
                autoCapitalize="characters"
                enterKeyHint="go"
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCDE"
                className="font-mono uppercase sm:col-start-2 sm:row-start-2"
                aria-invalid={!!codeError || undefined}
                aria-describedby={codeError ? `${codeId}-error` : undefined}
                onChange={(event) => {
                  setCode(event.target.value);
                  setCodeError(null);
                }}
              />
              {codeError ? (
                <FieldError
                  id={`${codeId}-error`}
                  className="sm:col-span-2 sm:col-start-2 sm:row-start-3"
                >
                  {codeError}
                </FieldError>
              ) : null}
            </Field>
            <Button
              type="submit"
              variant="outline"
              className="mt-4 justify-self-start sm:col-start-3 sm:row-start-2 sm:mt-0"
            >
              Entrar com código
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
