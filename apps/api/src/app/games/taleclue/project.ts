import type { TaleclueView } from "@resenhark/shared";
import { type TaleclueState, nextDeadline, nextNarratorId } from "./engine.js";

// Every field is built explicitly: never spread a state object here, or hidden data leaks.
export function project(s: TaleclueState, viewerId: string): TaleclueView {
  const over = s.phase === "game-over";
  const isPlayer = s.players.some((p) => p.id === viewerId);
  const tableOpen = s.phase === "vote" || s.phase === "reveal";
  const myCards = over
    ? []
    : [
        ...(s.narratorId === viewerId && s.narratorCard ? [s.narratorCard] : []),
        ...s.decoys.filter((d) => d.playerId === viewerId).flatMap((d) => d.cardIds),
      ];
  const myVote = tableOpen ? (s.votes.find((v) => v.voterId === viewerId)?.cardId ?? null) : null;
  // Only who acted, never what: a vote or a decoy is hidden until the reveal.
  const acted =
    s.phase === "decoy"
      ? s.decoys.map((d) => d.playerId)
      : s.phase === "vote"
        ? s.votes.map((v) => v.voterId)
        : [];
  return {
    phase: s.phase,
    config: {
      targetPoints: s.config.targetPoints,
      clueSeconds: s.config.clueSeconds,
      decoySeconds: s.config.decoySeconds,
      voteSeconds: s.config.voteSeconds,
      maxPlayers: s.config.maxPlayers,
    },
    round: s.round,
    narratorId: over ? null : s.narratorId,
    nextNarratorId: nextNarratorId(s),
    clue: over ? null : s.clue,
    decoyCount: s.decoyCount,
    hand: isPlayer && !over ? [...(s.hands[viewerId] ?? [])] : [],
    table: tableOpen && !over ? s.table.map((t) => t.cardId) : [],
    myCards,
    myVote,
    acted,
    players: s.players.map((p) => ({
      id: p.id,
      online: p.online,
      points: s.points[p.id] ?? 0,
      position: Math.min(s.points[p.id] ?? 0, s.config.targetPoints),
    })),
    deadline: nextDeadline(s),
    rounds: structuredClone(s.results),
    winners: [...s.winners],
    endReason: s.endReason,
  };
}
