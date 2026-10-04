"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { type Avatar, HUES, SHAPES, type Shape } from "@resenhark/shared";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { cn } from "@/lib/utils";

const HUE_LABELS: Record<(typeof HUES)[number], string> = {
  12: "Coral",
  45: "Âmbar",
  85: "Lima",
  150: "Verde",
  195: "Ciano",
  235: "Azul",
  275: "Violeta",
  320: "Rosa",
};

const SHAPE_LABELS: Record<Shape, string> = {
  round: "Redonda",
  boxy: "Quadrada",
  organic: "Orgânica",
  cloud: "Nuvem",
  sun: "Sol",
  nub: "Bolinhas",
  capsule: "Cápsula",
  triangle: "Triângulo",
  hexagon: "Hexágono",
  droplet: "Gota",
};

const OPTION =
  "inline-flex shrink-0 items-center justify-center rounded-full outline-hidden transition-[box-shadow] duration-[120ms] ease-out hover:ring-2 hover:ring-border-strong focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring data-[checked]:ring-2 data-[checked]:ring-primary-text data-[checked]:ring-offset-2 data-[checked]:ring-offset-background";

type AvatarPickerProps = {
  name: string;
  value: Avatar;
  onChange: (avatar: Avatar) => void;
};

export function AvatarPicker({ name, value, onChange }: AvatarPickerProps) {
  const seed = name.trim() || "?";
  return (
    <div className="flex flex-col gap-6">
      <div
        data-testid="avatar-preview"
        className="flex size-24 items-center justify-center self-start"
      >
        <MemberAvatar name={seed} avatar={value} size={96} animate />
      </div>

      <div className="flex flex-col gap-2">
        <span id="avatar-hue-label" className="text-sm font-medium">
          Cor
        </span>
        <RadioGroup
          aria-labelledby="avatar-hue-label"
          value={value.hue}
          onValueChange={(hue) => onChange({ ...value, hue: Number(hue) })}
          className="flex flex-wrap gap-3"
        >
          {HUES.map((hue) => (
            <Radio.Root
              key={hue}
              value={hue}
              aria-label={HUE_LABELS[hue]}
              className={cn(OPTION, "size-8")}
            >
              <MemberAvatar name={seed} avatar={{ hue, shape: value.shape }} size={32} />
            </Radio.Root>
          ))}
        </RadioGroup>
      </div>

      <div className="flex flex-col gap-2">
        <span id="avatar-shape-label" className="text-sm font-medium">
          Forma
        </span>
        <RadioGroup
          aria-labelledby="avatar-shape-label"
          value={value.shape}
          onValueChange={(shape) => onChange({ ...value, shape: shape as Shape })}
          className="flex flex-wrap gap-3"
        >
          {SHAPES.map((shape) => (
            <Radio.Root
              key={shape}
              value={shape}
              aria-label={SHAPE_LABELS[shape]}
              className={cn(OPTION, "size-10")}
            >
              <MemberAvatar name={seed} avatar={{ hue: value.hue, shape }} size={40} />
            </Radio.Root>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
