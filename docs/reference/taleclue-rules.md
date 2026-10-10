# Taleclue rules

These are the rules as the server implements them in `apps/api/src/app/games/taleclue` (`engine.ts`, `scoring.ts`, `deck.ts`, `project.ts`), plus the card memory in `apps/api/src/app/domain/room/room.ts`. Taleclue follows Dixit. Each round one player (the narrator) picks a card from their hand and gives a short clue. Everyone else plays a decoy card that fits the clue. The cards are shuffled on the table and everyone except the narrator votes for the card they think is the narrator's.

## Setup

- The owner picks Taleclue with `lobby:select-game`, sets the options below and starts the game. Taleclue needs no playlist.
- Players are the online members, in join order, up to `maxPlayers`. Everyone else is a spectator. Fewer than 3 online members return `not-enough-players` from `game:start`.
- The narrator order is shuffled once when the game starts and repeats every lap.
- Each player gets a hand of 6 cards. With 3 players the hand has 7 cards and each non-narrator plays 2 decoys instead of 1.
- The deck must hold at least `players x (hand size + decoys per player)` cards: 27 for 3 players, 56 for 8. A smaller deck returns `no-deck`.

| Option | Range | Default |
|---|---|---|
| `targetPoints` | 10 to 50 | 30 |
| `clueSeconds` | 30 to 180 | 90 |
| `decoySeconds` | 20 to 120 | 60 |
| `voteSeconds` | 20 to 120 | 60 |
| `maxPlayers` | 3 to 8 | 8 |

All five values are integers.

## A round

A round moves through `clue`, `decoy`, `vote` and `reveal`. The game ends in `game-over`. Every player acts once per phase. A second try while the phase is still open returns `already-acted`. If the last action already moved the phase on, the second try returns `wrong-phase`.

1. **Clue** (`clue`, `clueSeconds`). The narrator sends a card from their hand and a clue. After `trim`, the clue must have 1 to 30 characters; digits are allowed. A bad clue returns `invalid-hint`, and a card that is not in the hand returns `invalid-card`.
2. **Decoy** (`decoy`, `decoySeconds`). Everyone sees the clue. Each non-narrator sends 1 card from their hand (2 with 3 players). The view's `decoyCount` says how many. Everyone sees who has played, never which card.
3. **Vote** (`vote`, `voteSeconds`). The narrator's card and the decoys are shuffled on the table, with no owner shown. Each non-narrator votes for one card. A vote for one of your own cards returns `own-card`, and a card that is not on the table returns `invalid-card`. Everyone sees who has voted, never for what.
4. **Reveal** (`reveal`, 15 s). The owners, the votes and the points become public, as five ordered steps (see [Reveal steps](#reveal-steps)). The next round starts on its own when the 15 s end, unless someone has reached `targetPoints`.

A phase closes before its deadline when every online player who must act has acted and at least one of those actions was a real one. A phase where everyone is offline never closes by itself.

After a round, hands are refilled to full and the narrator role moves to the next player in the order.

## Scoring

Only the votes that were cast count. A non-narrator who did not vote is out of the calculation.

| Outcome | Narrator | Each voter who found the narrator's card | Each voter who missed |
|---|---|---|---|
| Some, but not all, found it (`some`) | 3 | 3 | 0 |
| All found it (`all`) | 0 | 2 | not applicable |
| None found it (`none`) | 0 | not applicable | 2 |
| Nobody voted (`no-votes`) | 0 | not applicable | not applicable |

On top of that, every vote on a decoy gives 1 point to the player who played it. There is no cap, and it applies in every outcome. In `all` every vote went to the narrator's card, so no decoy is paid. A player who plays 2 decoys gets the points for both.

The board position of a player is `min(points, targetPoints)`. Points themselves keep growing past the target.

## End of the game

- The game ends at the end of the reveal of the round in which someone reached `targetPoints`, with `endReason: "points"`. The players with the highest total win, and players tied at the top share the win.
- When the draw pile and the discards cannot refill the hands, the game ends with `endReason: "deck-empty"`. The winners are chosen as in `points`.
- When fewer than 3 players remain, the game ends at once with `endReason: "not-enough-players"`. The remaining players with the highest total win.
- The owner can end the game early with `game:end`: `endReason: "ended"` and no winners.

## Absences

- **Narrator without a clue.** When `clueSeconds` pass with no clue, the round is void: a `round-voided` event with reason `no-clue`, no points, and the next narrator starts. This holds even if the narrator is offline, so a short network drop does not cost them the turn before the deadline.
- **Decoy that never came.** When the decoy phase closes, by deadline or early, the server plays random cards from the hand of each player who has not played (`ctx.rng`). The `decoy-played` event carries `auto: true`.
- **Missing vote.** It does not count.
- **Pause.** With nobody online, no deadline runs. When someone comes back, the current phase restarts its full timer.
- **Reconnection.** A reconnecting player gets the current view with their hand intact. During a reveal the view carries the steps and the deadline, so the client can catch up.

## Leaving and joining

- A member who joins during a game is a spectator with no hand.
- A non-narrator who leaves or is kicked keeps the decoy cards and the vote they already sent. Cards still in their hand go to the discard pile. A vote on the decoy of a player who left counts as a missed vote and pays nobody.
- When the narrator leaves before the reveal, the round is void (`round-voided`, reason `narrator-left`). The cards on the table go to the discard pile, and the next narrator in the order starts. A narrator who leaves during the reveal does not void the round.
- If a departure closes the phase (everyone who remains has acted), the phase closes at once. The leaver gets no automatic decoy.

## The deck

- Within a game no card is dealt twice. When the draw pile runs out, the discards are shuffled back into it. Hands are never recycled.
- The room remembers the cards it has dealt (`lobby.taleclueUsed`). A new game draws only from the cards the room has not seen. When those cannot fill the hands, the memory resets and the whole deck plays. The memory is updated when a game starts, on `game:reset`, and when the owner changes the Hitline deck.
- Card ids come from `TALECLUE_CARDS` in `packages/shared/src/taleclue.ts`. The images live in the web app and are found by id. Until the real deck lands, the list holds 84 placeholders (`tc-001` to `tc-084`).

## Reveal steps

`round-revealed` and the view's `rounds` carry the steps for each round. All five always appear, in this order, even when the lists are empty. The server computes everything and the client only animates.

| Step | Content |
|---|---|
| `card-flip` | Each card on the table with its owner and whether it is the narrator's |
| `votes` | Each vote as voter and card |
| `award-correct` | The `outcome` and the points from the table above, for players who gained more than 0 |
| `award-decoy` | The points for votes on decoys |
| `board-move` | Each player's board position before and after, capped at `targetPoints` |
