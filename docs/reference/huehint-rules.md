# Huehint rules

These are the rules as the server implements them in `apps/api/src/app/games/huehint` (`engine.ts`, `color.ts`, `palette.ts`, `project.ts`), plus the color memory in `apps/api/src/app/domain/room/room.ts`. In Huehint, one player (the giver) sees a secret color and describes it in a short hint, such as "Vermelho McQueen". The others rebuild the color on a hue, saturation and brightness picker. Each guess scores from 0.00 to 10.00, and the giver scores the mean of the round. With one person online, Huehint becomes a solo memory game.

## Setup

- The owner picks Huehint with `lobby:select-game` and sets the options below, then starts the game. Huehint needs no playlist.
- Players are the online members, in join order, up to `maxPlayers`. Everyone else is a spectator.
- With 2 or more players the game runs in **group** mode. With 1 it runs in **solo** mode.
- A group game that starts with exactly 2 players is **cooperative** (see [Cooperative duo](#cooperative-duo)). A group game that starts with 3 or more is **competitive**, even if it later drops to 2.
- Group mode shuffles the giver order once and repeats it every lap, so each player gives `turnsPerPlayer` hints. The game has `players x turnsPerPlayer` rounds.
- Every round's color is drawn when the game starts (see [Color draw](#color-draw)).

| Option | Range | Default |
|---|---|---|
| `turnsPerPlayer` | 1 to 5 | 2 |
| `hintSeconds` | 15 to 90 | 30 |
| `guessSeconds` | 20 to 120 | 45 |
| `maxPlayers` | 2 to 15 | 15 |

Colors are integer HSB triples: `h` from 0 to 359, `s` and `b` from 0 to 100.

## A group round

A round moves through `hint`, `guessing` and `reveal`. The game ends in `game-over`.

1. **Hint** (`hint`, `hintSeconds`). Only the giver sees the color. The giver sends one hint. After `trim`, it must have 1 to 30 characters and at most 4 words, with no digit (in any script) and no `#`. A bad hint returns `invalid-hint`. The hint cannot change once sent.
2. **Guess** (`guessing`, `guessSeconds`). Everyone sees the hint. Each player except the giver sends one guess. A second guess returns `already-guessed`, and the giver gets `not-your-turn`. Everyone sees who guessed, never what.
3. **Reveal** (`reveal`, 12 s). The color, the hint, every guess and every score become public. The next round starts on its own when the 12 s end.

The guessing phase closes early when at least one guess is in and every other player has either guessed or is offline. A player who comes back online before the deadline can still guess. With no guesses at all, the round waits for the deadline, so a network blip that drops everyone does not end it.

If the hint deadline passes with no hint, the round ends with outcome `no-hint`. The color is revealed and nobody scores.

## Scoring

1. The target and the guess go from HSB to sRGB, then to CIE XYZ (D65), then to CIELAB.
2. The distance is the CIEDE2000 colour difference, ΔE.
3. The score is `10 × exp(-(ΔE / 25)²)`, rounded to 2 decimals.

| ΔE | Score |
|---|---|
| 0 | 10.00 |
| 10 | 8.52 |
| 20 | 5.27 |
| 40 | 0.77 |

The engine stores scores in hundredths as integers and sums integers, so totals never drift.

- A player who does not guess scores nothing for the round and stays out of the giver's mean.
- The giver scores the mean of the guesses sent, rounded to 2 decimals. With no guesses, the giver scores 0. A `no-hint` round gives the giver no score.
- A player's total is their guess points plus their giver points.

With exactly 2 players, each round gives the guesser and the giver the same points, so their totals always end equal. That is why a game that starts with 2 players is cooperative: no rule that favors one side holds up, because a wrong guess or a bad hint on purpose would move the tie. Equal totals in a competitive game share the win (see [End of the game](#end-of-the-game)).

## Cooperative duo

A game that starts with exactly 2 players has no individual winner. The two take turns giving the hint (the shuffled order repeated gives A, B, A, B) and the pair is graded by rank. The game stays cooperative for its whole life: `cooperative` is fixed at the start.

- **Team score.** The sum of one grade per round, counted once. A round with no hint or no guess grades 0 and still counts in the maximum.
- **Maximum.** 10.00 points for every revealed round. Mid-game the maximum covers only the rounds revealed so far, so the partial rank reflects how the pair is doing; at the end it is `players × turnsPerPlayer × 10` (40.00 for 4 rounds).
- **Rank** by the ratio score / maximum:

| Rank | Ratio from |
|---|---|
| S | 0.95 |
| A | 0.85 |
| B | 0.75 |
| C | 0.50 |
| D | 0.25 |
| E | below 0.25 |

  Each limit belongs to the higher rank, so 30.00 of 40.00 is a B. With nothing revealed yet the team is at 0 of 0, rank E.
- **Win.** B, A or S wins for both players. Below B, both lose. The server computes the rank and the win; the client only shows them.
- **Sabotage.** A wrong guess or a bad hint on purpose can only lower the team score, so it never helps either player.
- **No grade.** A cooperative game that ends by `game:end` (`ended`) or by a player leaving (`not-enough-players`) has no rank and no winners, and the view's `team` is `null`.

The `HUEHINT_RANKS` limits live in one place, `packages/shared/src/huehint.ts`.

## End of the game

- The game ends after the last reveal, with `endReason: "rounds-done"`.
  - **Competitive:** the highest total wins, and players tied on the highest total share the win. There is no tiebreak by giver points. A tiebreak that favors one side lets a misleading hint or a wrong guess decide the game. This replaces the earlier rule of breaking ties by giver points (the Ness-Brain note "Decisão - Desempate do Huehint pelos pontos de dica"), which no longer applies.
  - **Cooperative:** the duo wins at rank B or better, and then both players are in `winners`.
- The owner can end the game early (`game:end`), with `endReason: "ended"` and no winners.
- When a group game drops below 2 players, it ends at once with `endReason: "not-enough-players"`. A competitive game picks the winners by total among the remaining players. A cooperative game has no winners.

## Offline players and departures

- With nobody online, the game pauses: no deadline runs. When someone comes back, the current phase restarts its full timer.
- A giver who goes offline during the hint phase gets no special treatment, and the hint deadline settles the round. A giver who goes offline after the hint still gets the round's mean.
- A player who leaves or is kicked loses their future giver rounds. If they were giving the current hint, the round is cancelled with no reveal (`round-canceled`) and the next giver starts. If the round was past the hint, it goes on to the reveal. A leaving guesser's guess is dropped.
- Departed players disappear from the scoreboard. Their past guesses stay in the gallery of revealed rounds.

## Solo mode

- 5 rounds, with no giver.
- **Memorize** (`memorize`, 5 s). The player sees the color, then it hides (`memorize-ended`).
- **Guess** (`guessing`, `guessSeconds`). The player rebuilds the color from memory. The guess reveals at once. The deadline reveals with no guess.
- **Reveal** (`reveal`, 12 s), with the same scoring as the group game. The player can skip the rest of the reveal with `next-round`.
- The player wins at the end. Leaving ends the game with `endReason: "ended"`.

## Color draw

All the colors of a game are drawn at the start, one per round, with the server's random generator.

- **Families.** 12 perceptual families, sampled in CIELCH so each looks like its own named color: red, orange, yellow, lime, green, cyan, blue, purple, lavender, pink, brown and beige. Every block of 12 non-neutral rounds visits each family once, and two consecutive rounds never share a family, even across blocks. The exact color inside a family is uniform in its lightness, chroma and hue box, then converted to HSB (a color outside the sRGB gamut loses chroma until it fits).
- **Neutral.** Each round has a 10% chance of a neutral color (saturation 0 to 14), and a game has at most one color with saturation under 15.
- **Brightness** from 15 to 95. Dark colors (brightness under 35) look alike, so any 6 consecutive rounds have at most one.
- **Distance inside the game.** Each color is redrawn, up to 200 times, until it is at least ΔE 30 (CIEDE2000) from every earlier color of the same game. When no try gets there, the try with the most room to spare is kept.
- **Memory of the room.** The lobby keeps the last 60 colors drawn in the room, oldest first. A new game draws against them: at least ΔE 20 from the 8 newest and ΔE 12 from the other 52. "Outra rodada" (`game:start` after a finished game) and `game:reset` keep the list, and a new playlist does not clear it. Rooms saved before the memory existed start with an empty list. The distance relaxes with age because the sRGB gamut fits only about 25 colors that are 20 apart: against all 60, only 1% of new colors could keep ΔE 20.
- **Measured.** In a simulation of 5,000 pairs of consecutive 4-round games in the same room, the share of games with a color within ΔE 10 of the previous game dropped from 31.7% to 0.0%, and the median closest pair inside a game went from ΔE 28.4 to 31.0.

The curve constant (25), the distances and the neutral chance are a first calibration. They change after real play.
