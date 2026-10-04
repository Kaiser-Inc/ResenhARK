"use client";

import { HUES, type JoinRoomInput, joinRoomInputSchema } from "@resenhark/shared";
import { useId, useState } from "react";
import { toast } from "sonner";

import { AvatarPicker } from "@/components/avatar/avatar-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";

type JoinFormProps = {
  submitLabel: string;
  onSubmit: (input: JoinRoomInput) => Promise<void>;
  onRoomMissing?: () => void;
  onCancel?: () => void;
};

export function JoinForm({ submitLabel, onSubmit, onRoomMissing, onCancel }: JoinFormProps) {
  const id = useId();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<JoinRoomInput["avatar"]>({ hue: HUES[6], shape: "round" });
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = joinRoomInputSchema.safeParse({ name, avatar });
    if (!parsed.success) {
      setNameError("Escreva um nome de até 20 letras");
      return;
    }
    setNameError(null);
    setPending(true);
    try {
      await onSubmit(parsed.data);
      // Success navigates away; keep the button busy until the page changes.
    } catch (error) {
      setPending(false);
      if (error instanceof ApiError && error.code === "name-taken") {
        setNameError("Nome já em uso nesta sala");
      } else if (error instanceof ApiError && error.code === "room-full") {
        setFormError("A sala está cheia (20 pessoas)");
      } else if (error instanceof ApiError && error.code === "room-not-found") {
        onRoomMissing?.();
      } else {
        toast.error("Não deu certo. Tenta de novo.");
      }
    }
  }

  const nameId = `${id}-name`;
  const nameErrorId = `${id}-name-error`;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
      <FieldGroup>
        <Field data-invalid={!!nameError}>
          <FieldLabel htmlFor={nameId}>Seu nome</FieldLabel>
          <Input
            id={nameId}
            value={name}
            maxLength={20}
            autoComplete="nickname"
            aria-invalid={!!nameError || undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
          />
          {nameError ? <FieldError id={nameErrorId}>{nameError}</FieldError> : null}
        </Field>
        <AvatarPicker name={name} value={avatar} onChange={setAvatar} />
      </FieldGroup>
      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
