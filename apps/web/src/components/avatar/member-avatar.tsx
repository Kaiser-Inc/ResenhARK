import { Blobatar } from "@blobatar/react";
import type { Avatar, Shape } from "@resenhark/shared";
import type { HitlineView } from "@resenhark/shared";
import { type Expression, happy, idle, love, mad, sad, thinking } from "blobatar/expression";

import { motion } from "motion/react";

import { useReduced } from "@/components/hitline/motion";
import { cn } from "@/lib/utils";

// `love` and `mad` tint the head toward rose/red, which turns the player's own color into another one.
// Identity (hue) must survive the expression, so the same poses are used without their tint.
const untinted = ({ tint: _tint, ...pose }: Expression): Expression => pose;

const EXPRESSIONS = {
  idle,
  happy,
  sad,
  mad: untinted(mad),
  thinking,
  love: untinted(love),
} satisfies Record<string, Expression>;

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

/** What a member's face says about the game right now. First matching rule wins. */
export function expressionFor(memberId: string, view: HitlineView): MemberExpression {
  if (view.phase === "game-over") return view.winners.includes(memberId) ? "love" : "idle";
  if (view.phase === "guessing" && view.turnPlayerId === memberId) return "thinking";
  // The reveal reaction lasts until the next card is drawn.
  const reveal = view.phase === "turn-start" ? view.lastReveal : null;
  if (!reveal) return "idle";
  if (reveal.receiverId === memberId) return "happy";
  if (reveal.turnPlayerId === memberId) return reveal.receiverId ? "mad" : "sad";
  return "idle";
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
  const reduce = useReduced();
  const react = animate && !reduce;
  const jump = react && expression === "happy";
  return (
    <motion.span
      key={expression}
      aria-hidden="true"
      data-expression={expression}
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      initial={react && expression !== "idle" ? { opacity: 0.8 } : false}
      animate={{
        opacity: 1,
        transform: jump
          ? ["translateY(0px) scale(1)", "translateY(-5px) scale(1.04)", "translateY(0px) scale(1)"]
          : "translateY(0px) scale(1)",
      }}
      transition={{ duration: reduce ? 0 : 0.24, ease: [0.23, 1, 0.32, 1] }}
    >
      <Blobatar
        name={name}
        size={size}
        hue={avatar.hue}
        traits={{ shape: shapeTrait(avatar.shape) }}
        expression={EXPRESSIONS[expression]}
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
    </motion.span>
  );
}
