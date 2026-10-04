import type { HitlineView, PublicCard, RevealView } from "@resenhark/shared";
import type { Card, HitlineState, Reveal } from "./engine.js";

// Every field is built explicitly: never spread a state object here, or hidden data leaks.
export function toPublicCard(c: Card): PublicCard {
  return {
    id: c.id,
    title: c.title,
    artists: [...c.artists],
    year: c.year,
    spotifyUrl: c.spotifyUrl,
  };
}

export function toRevealView(r: Reveal): RevealView {
  return {
    card: toPublicCard(r.card),
    turnPlayerId: r.turnPlayerId,
    reason: r.reason,
    guess: r.guess
      ? {
          slot: r.guess.slot,
          title: r.guess.title,
          artist: r.guess.artist,
          correct: r.guess.correct,
          titleOk: r.guess.titleOk,
          artistOk: r.guess.artistOk,
        }
      : null,
    contests: r.contests.map((c) => ({ playerId: c.playerId, slot: c.slot, correct: c.correct })),
    receiverId: r.receiverId,
    tokenAwarded: r.tokenAwarded,
  };
}

export function project(state: HitlineState, viewerId: string): HitlineView {
  const turnPlayerId = state.phase === "game-over" ? null : (state.players[state.turn]?.id ?? null);
  const isTurnPlayer = turnPlayerId !== null && viewerId === turnPlayerId;
  let guess: HitlineView["guess"] = null;
  if (state.guess) {
    guess = isTurnPlayer
      ? { slot: state.guess.slot, title: state.guess.title, artist: state.guess.artist }
      : { slot: state.guess.slot };
  }
  return {
    phase: state.phase,
    config: {
      targetCards: state.config.targetCards,
      contestSeconds: state.config.contestSeconds,
      guessSeconds: state.config.guessSeconds,
      maxPlayers: state.config.maxPlayers,
    },
    turnPlayerId,
    deckCount: state.deck.length,
    players: state.players.map((p) => ({
      id: p.id,
      tokens: p.tokens,
      online: p.online,
      timeline: p.timeline.map(toPublicCard),
    })),
    draw: state.draw ? { id: state.draw.id, audioUrl: null } : null,
    guess,
    contests: state.contests.map((c) => ({ playerId: c.playerId, slot: c.slot })),
    passed: [...state.passed],
    bought: state.bought,
    turnDeadline: state.turnDeadline,
    contestDeadline: state.contestDeadline,
    lastReveal: state.lastReveal ? toRevealView(state.lastReveal) : null,
    discards: state.discards.map(toPublicCard),
    winners: [...state.winners],
    endReason: state.endReason,
  };
}
