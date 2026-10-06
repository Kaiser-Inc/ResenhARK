# Huehint rules

These are the rules as the server implements them in `apps/api/src/app/games/huehint` (`engine.ts`, `color.ts`, `palette.ts`, `project.ts`). In Huehint, one player (the giver) sees a secret color and describes it in a short hint, such as "Vermelho McQueen". The others rebuild the color on a hue, saturation and brightness picker. Each guess scores from 0.00 to 10.00, and the giver scores the mean of the round. With one person online, Huehint becomes a solo memory game.

## Setup

- The owner picks Huehint with `lobby:select-game` and sets the options below, then starts the game. Huehint needs no playlist.
- Players are the online members, in join order, up to `maxPlayers`. Everyone else is a spectator.
- With 2 or more players the game runs in **group** mode. With 1 it runs in **solo** mode.
- Group mode shuffles the giver order once and repeats it every lap, so each player gives `turnsPerPlayer` hints. The game has `players x turnsPerPlayer` rounds.
- Every round's color is drawn when the game starts (see [Color draw](#color-draw)).

| Option | Range | Default |
|---|---|---|
| `turnsPerPlayer` | 1 to 3 | 2 |
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

With exactly 2 players, each round gives the guesser and the giver the same points, so a game between 2 players ties unless a round has no hint or no guess.

## End of the game

- The game ends after the last reveal, with `endReason: "rounds-done"`. The highest total wins, and an exact tie shares the win.
- The owner can end the game early (`game:end`), with `endReason: "ended"` and no winners.
- When a group game drops below 2 players, it ends at once with `endReason: "not-enough-players"`, and the highest total among the remaining players wins.

## Offline players and departures

- With nobody online, the game pauses: no deadline runs. When someone comes back, the current phase restarts its full timer.
- A giver who goes offline during the hint phase gets no special treatment, and the hint deadline settles the round. A giver who goes offline after the hint still gets the round's mean.
- A player who leaves or is kicked loses their future giver rounds. If they were giving the current hint, the round is cancelled with no reveal (`round-canceled`) and the next giver starts. If the round was past the hint, it goes on to the reveal. A leaving guesser's guess is dropped.
- Departed players disappear from the scoreboard. Their past guesses stay in the gallery of revealed rounds.

## Solo mode

- 5 rounds, with no giver.
- **Memorize** (`memorize`, 3 s). The player sees the color, then it hides (`memorize-ended`).
- **Guess** (`guessing`, `guessSeconds`). The player rebuilds the color from memory. The guess reveals at once. The deadline reveals with no guess.
- **Reveal** (`reveal`, 12 s), with the same scoring as the group game.
- The player wins at the end. Leaving ends the game with `endReason: "ended"`.

## Color draw

All the colors of a game are drawn at the start, one per round, with the server's random generator.

- **Saturation** by band: vivid (40 to 100) with weight 70, soft (15 to 39) with weight 20 and neutral (0 to 14) with weight 10. After the first neutral, only vivid and soft remain, still 70 to 20, so a game has at most one neutral color.
- **Brightness** from 15 to 95, which avoids pure black and white.
- **Hue** in 6 sectors of 60°. Every block of 6 rounds visits each sector once in a shuffled order, and two consecutive rounds never share a sector, even across blocks. The exact hue within a sector is uniform.

The curve constant (25) and the band weights are a first calibration. They change after real play.
