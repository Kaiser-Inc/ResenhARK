"use client";

import { roomCodeSchema } from "@resenhark/shared";
import { animate, scrambleText } from "animejs";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { useReduced } from "@/components/hitline/motion";
import { JoinForm } from "@/components/join-form";
import { useRoomTransition } from "@/components/room/room-transition";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createRoom } from "@/lib/api";
import { saveSession } from "@/lib/session";

export function HomeActions() {
  const router = useRouter();
  const transition = useRoomTransition();
  const codeId = useId();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const createTextRef = useRef<HTMLSpanElement>(null);
  const createAnimation = useRef<ReturnType<typeof animate> | null>(null);
  const [createLabel, setCreateLabel] = useState("Criar sala");
  const codeRef = useRef<HTMLInputElement>(null);
  const wasCreating = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const reducedMotion = useReduced();

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // The create button unmounts while the form is open; hand focus back to it on cancel.
  useEffect(() => {
    if (wasCreating.current && !creating) createRef.current?.focus();
    wasCreating.current = creating;
  }, [creating]);

  // Cancel the DOM animation when the button unmounts or its form opens.
  useEffect(() => {
    if (creating) return;
    return () => {
      createAnimation.current?.cancel();
      createAnimation.current = null;
    };
  }, [creating]);

  function changeCreateLabel(text: string) {
    setCreateLabel(text);
    createAnimation.current?.cancel();
    if (!createTextRef.current) return;
    createAnimation.current = animate(createTextRef.current, {
      innerHTML: scrambleText({
        text,
        chars: "lowercase",
        override: false,
        duration: 650,
        settleDuration: 160,
      }),
    });
  }

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
    <motion.div
      initial={false}
      animate={{ height: height ?? "auto" }}
      transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="w-full max-w-sm overflow-clip [overflow-clip-margin:12px]"
    >
      <div ref={contentRef} className="flex flex-col gap-12">
        {creating ? (
          <motion.section
            key="create"
            aria-labelledby="create-heading"
            className="flex flex-col gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
          >
            <h2 id="create-heading" className="text-xl leading-7 font-semibold">
              Criar sala
            </h2>
            <JoinForm
              submitLabel="Criar e entrar"
              focusOnMount
              onCancel={() => setCreating(false)}
              onSubmit={async (input) => {
                const closing = transition.begin();
                try {
                  const [room] = await Promise.all([createRoom(input), closing]);
                  saveSession(room.code, {
                    memberId: room.memberId,
                    sessionToken: room.sessionToken,
                    name: input.name,
                  });
                  router.push(`/sala/${room.code}`);
                } catch (error) {
                  transition.finish();
                  throw error;
                }
              }}
            />
          </motion.section>
        ) : (
          <div className="flex w-full max-w-sm flex-col gap-3">
            <form
              onSubmit={enterWithCode}
              noValidate
              className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-2"
            >
              <Field data-invalid={!!codeError} className="contents">
                <FieldLabel htmlFor={codeId} className="col-span-2">
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
                  className="col-start-1 row-start-2 min-w-0 font-mono uppercase"
                  aria-invalid={!!codeError || undefined}
                  aria-describedby={codeError ? `${codeId}-error` : undefined}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setCodeError(null);
                  }}
                />
                {codeError ? (
                  <FieldError id={`${codeId}-error`} className="col-span-2 col-start-1 row-start-3">
                    {codeError}
                  </FieldError>
                ) : null}
              </Field>
              <Button type="submit" variant="outline" className="col-start-2 row-start-2">
                Entrar
              </Button>
            </form>
            <Button
              ref={createRef}
              aria-label={createLabel}
              className="home-create-room relative w-full"
              onPointerEnter={(event) => {
                if (
                  event.pointerType === "mouse" &&
                  window.matchMedia("(hover: hover) and (pointer: fine)").matches
                )
                  changeCreateLabel("Começar a resenha!");
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") changeCreateLabel("Criar sala");
              }}
              onPointerCancel={() => changeCreateLabel("Criar sala")}
              onClick={() => {
                setCreateLabel("Criar sala");
                setCreating(true);
              }}
            >
              <span
                ref={createTextRef}
                data-testid="create-room-label"
                aria-hidden="true"
                className="min-w-[18ch] text-center"
              >
                Criar sala
              </span>
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
