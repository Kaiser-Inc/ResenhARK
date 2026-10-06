# Hitline rules

These are the rules as the server implements them in `apps/api/src/app/games/hitline` (`engine.ts`, `normalize.ts`, `slots.ts`) and `apps/api/src/app/domain/room/room.ts`. The goal is to be the first player to reach `targetCards` cards in your timeline. A timeline is a list of songs ordered by release year.

## Setup

- Every room starts with the built-in deck, "Baralho ResenhARK" (`apps/api/src/app/games/hitline/default-deck.json`). The owner can import a Spotify playlist instead, go back to the built-in deck with `lobby:use-default-deck`, set the options (see below) and start the game.
- Players are the online members, in join order, up to `maxPlayers`. Everyone else is a spectator. A member who joins during a game is a spectator and can play the next one.
- The deck is shuffled, and the turn order is random.
- Each player starts with 1 revealed card from the deck and 2 tokens.
- A game needs more songs in the pool than players, so at least one card remains to draw. Otherwise the start fails with `playlist-empty`, or `playlist-exhausted` when songs were already played in the room.

| Option | Range | Default |
|---|---|---|
| `targetCards` (cards to win) | 5 to 15 | 10 |
| `contestSeconds` | 5 to 60 | 15 |
| `guessSeconds` | 30 to 300 | 120 |
| `maxPlayers` | 1 to 15 | 15 |

The lobby warns about a small playlist when the songs not yet played number fewer than `min(online members, maxPlayers) x targetCards x 2`. The owner decides whether to play anyway.

## A turn

A turn moves through these phases: `turn-start`, then `guessing`, then `contest`, then back to `turn-start` for the next player. A game ends in `game-over`.

1. **Draw** (`turn-start`). The turn player draws the top card of the deck and everyone hears a clip. Nobody sees the year, title or artist.
2. **Guess** (`guessing`). The turn player picks a slot in their timeline and can type a title and an artist. The slot is a gap, numbered from 0 (before the first card) to the number of cards (after the last). Locking the guess ends the phase.
3. **Contest** (`contest`). Other players can bet on a different slot or pass. See below.
4. **Reveal.** The card is revealed and goes to its owner, or is discarded. The turn passes to the next online player.

## Tokens

Tokens have no cap.

| Action | Cost | Who and when |
|---|---|---|
| Skip | 1 | Turn player, while guessing. The drawn card is revealed and discarded, and the next card is drawn. |
| Buy | 3 | Turn player, at `turn-start` or while guessing, once per turn. |
| Contest | 1 | Another player, during the contest window. |

**Skip.** The skipped card goes to the discards, publicly. The game draws the next card.

**Buy.** The card goes straight into the turn player's timeline at its correct place. While a card is drawn, the buy takes the card after the drawn one, so the drawn card stays hidden. If the timeline reaches `targetCards`, the player wins. If the deck has no card to buy, the game ends as `deck-empty`.

**Earning a token.** The turn player gets 1 token when:

- the position is right and the title or the artist is right, or
- the position is wrong but both the title and the artist are right.

Only the turn player earns tokens this way.

## Correct position

A slot is right when the previous card's year is at most the song's year and the song's year is at most the next card's year. Equal years are therefore fine on either side, and any slot that fits is correct. This is the same-year rule: with two songs from the same year, either order is right.

## Contest

- The window lasts `contestSeconds` from the lock.
- The window opens only if at least one other player is online, has 1 or more tokens, and so can contest. With one player, or when nobody can contest, the card resolves at once.
- Each other player can contest once or pass. A contest picks a slot of the turn player's timeline that is not the turn player's slot and not another contest's slot (`slot-taken`). The token is spent when you contest, whether you win or not.
- The window closes when every other player has contested, passed, is offline, or has no token. Otherwise it closes at the deadline.
- An offline player counts as having passed.

## Priority

When more than one slot is right, the card goes to:

1. the turn player, if their slot is right, otherwise
2. the first contester, in the order of contests, whose slot is right.

If nobody is right, the card is discarded. The card is placed in the receiver's timeline at its correct place by year.

## Winning

- **Target.** The first player whose timeline reaches `targetCards` wins at once. This includes reaching it by buying or by winning a contest. The winner is the receiver of that card.
- **Deck empty.** If a player must draw or buy and the deck is empty, the game ends. The longest timeline wins. Tokens break a tie, and a tie that remains is shared among the tied players.
- **Ended by the owner.** `game:end` ends the game with no winners.
- **Missing audio.** A card with no preview on Deezer or iTunes is dropped without a reveal or a discard and at no cost. The game emits `audio-missing` and draws the next card. After 10 consecutive misses the game ends as `deck-empty`.

## Timers

All deadlines are absolute timestamps in the game state.

- **Guess timer.** `guessSeconds` starts at the start of the turn, not at the draw. If it runs out at `turn-start`, the turn passes (`turn-passed`, reason `timeout`). If it runs out while guessing, the card is revealed with reason `timeout` and discarded, with no token, and the turn passes.
- **Contest timer.** `contestSeconds`, from the lock.
- **Offline turn player.** A player who is offline for 30 seconds loses the turn when someone else is online. The drawn card, if any, goes back to the bottom of the deck unrevealed, and the turn passes (`turn-passed`, reason `offline`). The 30 second limit replaces the guess timer when it comes first. Players keep their cards and tokens.
- **Nobody online.** Nothing ticks, so an abandoned room can expire. A player who returns when nobody was online gets a fresh guess timer.
- Turns skip offline players while anyone is online.

## Players who leave

A kicked or departed player is removed from the running game. If it was their turn, a drawn card goes back to the bottom of the deck and the turn passes (`turn-passed`, reason `removed`). If no players remain, the game ends with no winners.

## Another round without repeats

Every card that left the deck during a game counts as played in the room: dealt, drawn, skipped, bought or dropped for missing audio. When a game finishes and the owner clicks **Outra rodada** (or starts a new game directly), those cards are added to the room's played set. The next game draws only from songs not yet played.

A card's identity for this purpose is its Spotify URL, else its ISRC, else the normalized title plus the artists. Card ids change on every import, so they are not used.

- Importing another playlist clears the played set.
- **Recomeçar músicas** (`lobby:reset-played`) clears it.
- When the remaining songs are too few for the players, the lobby shows how many remain and the start fails with `playlist-exhausted`. The owner decides to reset the played songs.

## Name matching

The title and the artist you type are compared to the real ones with these steps:

1. Lowercase and remove accents.
2. For titles, remove a suffix after ` - ` (for example "- Remastered"), text in parentheses or brackets, an unclosed parenthesis or bracket and everything after it, and everything after `feat`, `ft` or `featuring`. Replace `&` with `and`.
3. Remove apostrophes, a leading `the `, and punctuation. Collapse spaces.
4. If a text becomes empty (for example "!!!"), compare the lowercase, accent-free text without these steps.

The guess matches when the Levenshtein distance between the two normalized texts is at most 20% of the real text's length, rounded down. A blank guess never matches. The artist guess matches when it matches any one of the song's artists. Spelling "mr brightside" for "Mr. Brightside" passes.

The same accent- and case-insensitive folding applies to member names, which is why "Ana" and "ana" count as the same name in a room (see [Realtime events](realtime-events.md)).
