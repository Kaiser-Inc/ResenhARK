"use client";

import type { HitlineConfig } from "@resenhark/shared";
import { useId } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const range = (from: number, to: number, step = 1) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

type Option = { value: string; label: string };
const options = (values: number[], unit = ""): Option[] =>
  values.map((v) => ({ value: String(v), label: `${v}${unit}` }));

const FIELDS: { key: keyof HitlineConfig; label: string; options: Option[] }[] = [
  { key: "targetCards", label: "Cartas para vencer", options: options(range(2, 30)) },
  { key: "contestSeconds", label: "Tempo de contestação", options: options(range(5, 60, 5), " s") },
  { key: "guessSeconds", label: "Tempo de palpite", options: options(range(30, 300, 30), " s") },
  { key: "maxPlayers", label: "Máximo de jogadores", options: options(range(1, 15)) },
];

type GameConfigFormProps = {
  config: HitlineConfig;
  /** Owner only: others see the values as text. */
  onChange?: (config: HitlineConfig) => void;
  disabled?: boolean;
};

function labelOf(field: (typeof FIELDS)[number], config: HitlineConfig) {
  return field.options.find((o) => o.value === String(config[field.key]))?.label ?? "";
}

export function GameConfigForm({ config, onChange, disabled = false }: GameConfigFormProps) {
  const id = useId();
  if (!onChange) {
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        {FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd className="font-medium">{labelOf(field, config)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {FIELDS.map((field) => (
        <Field key={field.key}>
          <FieldLabel htmlFor={`${id}-${field.key}`}>{field.label}</FieldLabel>
          <Select
            items={field.options}
            value={String(config[field.key])}
            disabled={disabled}
            onValueChange={(value) => {
              if (value) onChange({ ...config, [field.key]: Number(value) });
            }}
          >
            <SelectTrigger id={`${id}-${field.key}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ))}
    </div>
  );
}
