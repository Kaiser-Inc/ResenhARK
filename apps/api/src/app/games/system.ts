/** Actor for room-driven actions (presence aside): removing a player, ending, missing audio. */
export const SYSTEM_ACTOR = "system";

export type Ctx = { now: number; rng: () => number; newId: () => string };

/** Room-driven actions every game accepts with the same shape. */
export type SystemAction =
  | { type: "set-online"; online: boolean }
  | { type: "remove"; playerId: string }
  | { type: "end" };
