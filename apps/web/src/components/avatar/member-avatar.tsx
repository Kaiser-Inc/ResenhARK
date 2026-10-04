import { Blobatar } from "@blobatar/react";
import type { Avatar, Shape } from "@resenhark/shared";
import { type Expression, happy, idle, love, mad, sad, thinking } from "blobatar/expression";

import { cn } from "@/lib/utils";

const EXPRESSIONS = { idle, happy, sad, mad, thinking, love } satisfies Record<string, Expression>;

export type MemberExpression = keyof typeof EXPRESSIONS;

// Blobatar picks the body shape from a number in [0, 1) split into weighted bands
// (round 0-.22, organic .22-.48, boxy .48-.6, capsule .6-.7, nub .7-.79, cloud .79-.86,
// droplet .86-.915, hexagon .915-.95, sun .95-.98, triangle .98-1), not ten equal ones.
// Evenly spaced values collapse several shapes into one, so each shape gets its band midpoint.
const SHAPE_TRAIT: Record<Shape, number> = {
  round: 0.11,
  organic: 0.35,
  boxy: 0.54,
  capsule: 0.65,
  nub: 0.745,
  cloud: 0.825,
  droplet: 0.8875,
  hexagon: 0.9325,
  sun: 0.965,
  triangle: 0.99,
};

export function shapeTrait(shape: Shape): number {
  return SHAPE_TRAIT[shape];
}

type MemberAvatarProps = {
  name: string;
  avatar: Avatar;
  size?: number;
  expression?: MemberExpression;
  animate?: boolean;
  online?: boolean;
  className?: string;
};

export function MemberAvatar({
  name,
  avatar,
  size = 40,
  expression = "idle",
  animate = false,
  online,
  className,
}: MemberAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <Blobatar
        name={name}
        size={size}
        hue={avatar.hue}
        traits={{ shape: shapeTrait(avatar.shape) }}
        expression={EXPRESSIONS[expression]}
        animate={animate ? "always" : undefined}
        background="circle"
        aria-hidden="true"
      />
      {online === undefined ? null : (
        <span
          data-presence={online ? "online" : "offline"}
          className={cn(
            "absolute right-0 bottom-0 size-2 rounded-full ring-2 ring-background",
            online ? "bg-success" : "bg-muted-foreground",
          )}
        />
      )}
    </span>
  );
}
