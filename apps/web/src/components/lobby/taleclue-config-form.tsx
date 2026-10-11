"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TALECLUE_OPTIONS, withCurrent } from "@/lib/config-options";
import type { TaleclueConfig } from "@resenhark/shared";
import { useId } from "react";

const FIELDS: {
  key: keyof TaleclueConfig;
  label: string;
  unit?: string;
}[] = [
  { key: "targetPoints", label: "Meta de pontos" },
  { key: "clueSeconds", label: "Tempo da pista", unit: " s" },
  { key: "decoySeconds", label: "Tempo das iscas", unit: " s" },
  { key: "voteSeconds", label: "Tempo do voto", unit: " s" },
  { key: "maxPlayers", label: "Máximo de jogadores" },
];

export function TaleclueConfigForm({
  config,
  onChange,
  disabled = false,
}: { config: TaleclueConfig; onChange?: (config: TaleclueConfig) => void; disabled?: boolean }) {
  const id = useId();
  if (!onChange)
    return (
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd className="font-medium">
              {config[field.key]}
              {field.unit}
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FIELDS.map((field) => {
        const options = withCurrent(TALECLUE_OPTIONS[field.key], config[field.key]).map(
          (value) => ({
            value: String(value),
            label: `${value}${field.unit ?? ""}`,
          }),
        );
        return (
          <Field key={field.key}>
            <FieldLabel htmlFor={`${id}-${field.key}`}>{field.label}</FieldLabel>
            <Select
              items={options}
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
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        );
      })}
    </div>
  );
}
