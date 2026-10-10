import type { TaleclueOutcome, TaleclueStep } from "@resenhark/shared";

export type TableCard = { cardId: string; ownerId: string };
export type Vote = { voterId: string; cardId: string };

export const CORRECT_POINTS = 3;
export const CONSOLATION_POINTS = 2;
export const DECOY_POINTS = 1;

const award = (points: Map<string, number>) =>
  [...points].filter(([, p]) => p > 0).map(([playerId, p]) => ({ playerId, points: p }));

/**
 * Scores one round and builds its reveal steps. Only the votes cast count: a player who did not vote
 * is out of the calculation. Awards go to players still in the game (`activeIds`) only, but a vote
 * from or for someone who left still counts toward the outcome.
 */
export function scoreRound(input: {
  narratorId: string;
  table: TableCard[];
  votes: Vote[];
  activeIds: string[];
  pointsBefore: Map<string, number>;
  targetPoints: number;
}): { steps: TaleclueStep[]; gained: Map<string, number> } {
  const { narratorId, table, votes, activeIds, pointsBefore, targetPoints } = input;
  const active = new Set(activeIds);
  const ownerOf = new Map(table.map((c) => [c.cardId, c.ownerId]));
  const correct = votes.filter((v) => ownerOf.get(v.cardId) === narratorId);
  const outcome: TaleclueOutcome =
    votes.length === 0
      ? "no-votes"
      : correct.length === 0
        ? "none"
        : correct.length === votes.length
          ? "all"
          : "some";

  const correctAwards = new Map<string, number>();
  if (outcome === "some") {
    correctAwards.set(narratorId, CORRECT_POINTS);
    for (const v of correct) correctAwards.set(v.voterId, CORRECT_POINTS);
  } else if (outcome === "all" || outcome === "none") {
    for (const v of votes) correctAwards.set(v.voterId, CONSOLATION_POINTS);
  }

  // One point per vote on a decoy, to its owner, in table order.
  const decoyAwards = new Map<string, number>();
  for (const card of table) {
    if (card.ownerId === narratorId) continue;
    const count = votes.filter((v) => v.cardId === card.cardId).length;
    if (count > 0) decoyAwards.set(card.ownerId, (decoyAwards.get(card.ownerId) ?? 0) + count);
  }
  for (const id of correctAwards.keys()) if (!active.has(id)) correctAwards.delete(id);
  for (const id of decoyAwards.keys()) if (!active.has(id)) decoyAwards.delete(id);

  const gained = new Map(
    activeIds.map((id) => [id, (correctAwards.get(id) ?? 0) + (decoyAwards.get(id) ?? 0)]),
  );
  const steps: TaleclueStep[] = [
    {
      type: "card-flip",
      cards: table.map((c) => ({
        cardId: c.cardId,
        ownerId: c.ownerId,
        narrator: c.ownerId === narratorId,
      })),
    },
    { type: "votes", votes: votes.map((v) => ({ voterId: v.voterId, cardId: v.cardId })) },
    { type: "award-correct", outcome, awards: award(correctAwards) },
    { type: "award-decoy", awards: award(decoyAwards) },
    {
      type: "board-move",
      moves: activeIds.map((playerId) => {
        const before = pointsBefore.get(playerId) ?? 0;
        return {
          playerId,
          from: Math.min(before, targetPoints),
          to: Math.min(before + (gained.get(playerId) ?? 0), targetPoints),
        };
      }),
    },
  ];
  return { steps, gained };
}
