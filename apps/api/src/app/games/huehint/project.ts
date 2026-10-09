import type { HuehintRoundView, HuehintView } from "@resenhark/shared";
import { type HuehintState, type RoundResult, nextDeadline, totals } from "./engine.js";

// Every field is built explicitly: never spread a state object here, or hidden data leaks.
const points = (hundredths: number) => hundredths / 100;

export function toRoundView(r: RoundResult): HuehintRoundView {
  return {
    round: r.round,
    giverId: r.giverId,
    color: { h: r.color.h, s: r.color.s, b: r.color.b },
    hint: r.hint,
    outcome: r.outcome,
    guesses: r.guesses.map((g) => ({
      playerId: g.playerId,
      color: { h: g.color.h, s: g.color.s, b: g.color.b },
      score: points(g.score),
    })),
    giverScore: r.giverScore === null ? null : points(r.giverScore),
  };
}

export function project(s: HuehintState, viewerId: string): HuehintView {
  const over = s.phase === "game-over";
  const current = over ? undefined : s.schedule[s.round];
  const giverId = current?.giverId ?? null;
  const isPlayer = s.players.some((p) => p.id === viewerId);
  // The target: the giver while hinting and guessing, the solo player while memorizing.
  const seesTarget =
    ((s.phase === "hint" || s.phase === "guessing") && giverId !== null && viewerId === giverId) ||
    (s.phase === "memorize" && isPlayer);
  const mine = s.phase === "guessing" ? s.guesses.find((g) => g.playerId === viewerId) : undefined;
  const t = totals(s);
  return {
    mode: s.mode,
    // Saves from before the cooperative mode have no flag.
    cooperative: s.cooperative ?? false,
    team: null,
    phase: s.phase,
    config: {
      turnsPerPlayer: s.config.turnsPerPlayer,
      hintSeconds: s.config.hintSeconds,
      guessSeconds: s.config.guessSeconds,
      maxPlayers: s.config.maxPlayers,
    },
    round: Math.min(s.round + 1, s.schedule.length),
    totalRounds: s.schedule.length,
    giverId,
    nextGiverId: over ? null : (s.schedule[s.round + 1]?.giverId ?? null),
    color:
      seesTarget && current ? { h: current.color.h, s: current.color.s, b: current.color.b } : null,
    hint: s.hint,
    submitted: s.phase === "guessing" ? s.guesses.map((g) => g.playerId) : [],
    myGuess: mine ? { h: mine.color.h, s: mine.color.s, b: mine.color.b } : null,
    deadline: nextDeadline(s),
    players: s.players.map((p) => {
      const sum = t.get(p.id) ?? { guess: 0, giver: 0 };
      return {
        id: p.id,
        online: p.online,
        guessPoints: points(sum.guess),
        giverPoints: points(sum.giver),
        total: points(sum.guess + sum.giver),
      };
    }),
    rounds: s.results.map(toRoundView),
    winners: [...s.winners],
    endReason: s.endReason,
  };
}
