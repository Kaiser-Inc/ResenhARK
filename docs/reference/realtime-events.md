# Realtime events and HTTP routes

The contracts live in `packages/shared/src` (`realtime.ts`, `hitline.ts`, `huehint.ts`, `room.ts`). The handlers are in `apps/api/src/app/realtime/socket-gateway.ts` and `apps/api/src/app/http/routes`.

## Join flow

1. `POST /rooms` (create) or `POST /rooms/:code/members` (join) returns a `memberId` and a `sessionToken`. The web app stores the token in `localStorage`.
2. The client opens a Socket.IO connection with `auth: { sessionToken }`.
3. The server sends `chat:history`, then `room:state` snapshots after every change.

An unknown or revoked token fails the handshake with the error message `invalid-session`.

## Client to server (Socket.IO)

Every intent takes an optional acknowledgement callback. Its argument is an `Ack`:

```ts
type Ack = { ok: true } | { ok: false; error: ErrorCode };
```

A failed intent never changes state. The state comes back through `room:state`, not through the ack. A client-side `timeout` code means the emit got no ack in time.

| Event | Payload | Who | Errors |
|---|---|---|---|
| `chat:send` | `{ text: string }`, 1 to 500 characters after trim | Any member | `invalid-message`, `rate-limited`, `invalid-session`, `server-error` |
| `room:leave` | none | Any member | `invalid-session` |
| `room:kick` | `{ targetId: string }` | Owner | `invalid-input`, `not-owner`, `invalid-target` |
| `lobby:select-game` | `{ game: "hitline" \| "huehint" }` | Owner, no game running | `invalid-input`, `not-owner`, `game-running` |
| `lobby:configure` | `HitlineConfig` (below) | Owner, no game running | `invalid-input`, `not-owner`, `game-running` |
| `lobby:configure-huehint` | `HuehintConfig` (below) | Owner, no game running | `invalid-input`, `not-owner`, `game-running` |
| `lobby:import` | `{ link: string }`, 1 to 500 characters | Owner, no game running | `invalid-input`, `room-not-found`, `not-owner`, `game-running`, `playlist-invalid-link`, `playlist-no-access`, `playlist-empty`, `spotify-disconnected` |
| `lobby:reset-played` | none | Owner, no game running | `not-owner`, `game-running` |
| `game:start` | none | Owner, no game running. Starts the selected game | `not-owner`, `game-running`, and for Hitline only `no-deck`, `playlist-empty`, `playlist-exhausted` |
| `game:end` | none | Owner, game running | `not-owner`, `no-game` |
| `game:reset` | none | Owner, game finished | `not-owner`, `no-game` |
| `game:action` | `HitlineIntent` or `HuehintIntent` (below), validated against the running game | Players | `invalid-input`, `no-game`, and the rule errors below |

`lobby:import` replaces the deck, clears the played set and removes a finished game. `game:reset` is the "Outra rodada" button: it clears the finished game and keeps the playlist and the played set. `lobby:reset-played` is "Recomeçar músicas".

`room:leave` and `room:kick` remove the member from a running game. When a leaving member owns the room, the next online member becomes the owner. The kicked member receives `room:kicked`, and the server disconnects their sockets and revokes their sessions.

### `HitlineConfig`

```ts
{
  targetCards: number;    // 2 to 30, default 10
  contestSeconds: number; // 5 to 60, default 15
  guessSeconds: number;   // 30 to 300, default 120
  maxPlayers: number;     // 1 to 15, default 15
}
```

All four values are integers.

### `HitlineIntent`

Sent in `game:action`.

| `type` | Extra fields | Rule |
|---|---|---|
| `draw` | none | Turn player, phase `turn-start` |
| `skip` | none | Turn player, phase `guessing`, costs 1 token |
| `buy` | none | Turn player, phase `turn-start` or `guessing`, costs 3 tokens, once per turn |
| `lock-guess` | `slot: number` (integer, 0 or more), `title: string` (up to 100), `artist: string` (up to 100) | Turn player, phase `guessing` |
| `contest` | `slot: number` (integer, 0 or more) | Other players, phase `contest`, costs 1 token |
| `pass` | none | Other players, phase `contest` |

Rule errors: `not-a-player`, `not-your-turn`, `wrong-phase`, `insufficient-tokens`, `already-bought`, `slot-taken`, `invalid-slot`, `already-decided`. The full rules are in [Hitline rules](hitline-rules.md).

### `HuehintConfig`

```ts
{
  turnsPerPlayer: number; // 1 to 3, default 2
  hintSeconds: number;    // 15 to 90, default 30
  guessSeconds: number;   // 20 to 120, default 45
  maxPlayers: number;     // 2 to 15, default 15
}
```

All four values are integers.

### `HuehintIntent`

Sent in `game:action`. A color is `Hsb`: `{ h: 0 to 359, s: 0 to 100, b: 0 to 100 }`, integers.

| `type` | Extra fields | Rule |
|---|---|---|
| `give-hint` | `hint: string` (up to 200 in the payload) | Giver, phase `hint`, once. The hint must pass `isValidHint`: 1 to 30 characters after trim, at most 4 words, no digit and no `#` |
| `guess` | `color: Hsb` | Players except the giver, phase `guessing`, once |

Rule errors: `not-a-player`, `not-your-turn`, `wrong-phase`, `invalid-hint`, `already-guessed`. The full rules are in [Huehint rules](huehint-rules.md).

## Server to client

| Event | Payload | Meaning |
|---|---|---|
| `room:state` | `{ room: RoomView; events: GameEvent[] }` | Snapshot for this member after every committed change, plus the game events that caused it. The snapshot is the truth for the screen. Events only trigger animations. |
| `chat:history` | `ChatMessage[]`, oldest first | Sent once after connecting, up to 200 messages. A message sent meanwhile may also arrive live, so clients dedupe by `id`. |
| `chat:message` | `ChatMessage` | A new message, user or system. |
| `room:kicked` | none | Sent to a kicked member just before the server disconnects them. |

### `RoomView`

```ts
{
  code: string;
  you: string;          // your memberId
  ownerId: string;
  members: { id; name; avatar; online: boolean; isOwner: boolean;
             role: "player" | "spectator" | "member" }[];
  lobby: { selectedGame: "hitline" | "huehint";
           config: HitlineConfig;
           huehintConfig: HuehintConfig;
           playlist: { name: string; count: number } | null;
           remaining: number | null;   // songs not played yet in this room
           smallPlaylist: boolean };   // remaining < min(online, maxPlayers) x targetCards x 2
  game: { type: "hitline"; view: HitlineView }
      | { type: "huehint"; view: HuehintView }
      | null;
  serverNow: number;    // server clock in ms, for deadline countdowns
}
```

`role` is `member` while no game runs. During a game, players are `player` and everyone else is `spectator`.

### `HitlineView`

| Field | Meaning |
|---|---|
| `phase` | `turn-start`, `guessing`, `contest` or `game-over` |
| `config` | The game's `HitlineConfig` |
| `turnPlayerId` | Whose turn it is, `null` after game over |
| `deckCount` | Cards left in the deck. Only the count, never the contents |
| `players[]` | `id`, `tokens`, `online`, `offlineDeadline` (turn player only, `null` otherwise or while online), `timeline` (public cards in year order) |
| `draw` | `{ id, audioUrl }` while a card is drawn, otherwise `null`. `audioUrl` is a signed path, see [Hidden information](../explanation/hidden-information.md) |
| `guess` | `{ slot }` for everyone, plus `title` and `artist` only for the turn player |
| `contests[]` | `{ playerId, slot }` |
| `passed[]` | Ids of players who passed |
| `bought` | Whether the turn player already bought this turn |
| `turnDeadline`, `contestDeadline` | Absolute timestamps in ms. `contestDeadline` is `null` outside the contest phase |
| `lastReveal` | The last reveal (`RevealView`), kept until the next draw |
| `discards[]` | Public cards that were discarded |
| `winners[]`, `endReason` | Set at game over. `endReason` is `target`, `deck-empty` or `ended` |

A `PublicCard` is `{ id, title, artists, year, spotifyUrl }`. A `RevealView` holds the card, `turnPlayerId`, `reason` (`resolved` or `timeout`), the turn player's `guess` with `correct`, `titleOk` and `artistOk`, the `contests` with `correct`, `receiverId` and `tokenAwarded`.

### `HuehintView`

| Field | Meaning |
|---|---|
| `mode` | `group` or `solo` |
| `phase` | `hint`, `memorize` (solo), `guessing`, `reveal` or `game-over` |
| `config` | The game's `HuehintConfig` |
| `round`, `totalRounds` | 1-based current round and the round count. Departures can lower `totalRounds` |
| `giverId`, `nextGiverId` | Current and next giver. `null` in solo and after game over |
| `color` | The secret color. Set only for the giver in `hint` and `guessing`, and for the solo player in `memorize`. `null` for everyone else |
| `hint` | The hint once given, else `null` |
| `submitted[]` | Ids of who guessed this round. Never their colors |
| `myGuess` | Your own guess during `guessing`, else `null` |
| `deadline` | When the current phase ends, in ms. `null` while paused or after game over |
| `players[]` | `id`, `online`, `guessPoints`, `giverPoints`, `total`, in points with 2 decimals |
| `rounds[]` | Revealed rounds, oldest first (`HuehintRoundView`) |
| `winners[]`, `endReason` | Set at game over. `endReason` is `rounds-done`, `ended` or `not-enough-players` |

A `HuehintRoundView` is `{ round, giverId, color, hint, outcome, guesses, giverScore }`. `outcome` is `revealed` or `no-hint`. `guesses` holds `{ playerId, color, score }`, with scores from 0 to 10. `giverScore` is the mean of the guesses (0 with none), or `null` for a `no-hint` round and in solo.

### `GameEvent`

Hitline events:

| `type` | Fields |
|---|---|
| `game-started` | none |
| `card-drawn` | `drawId` |
| `card-skipped` | `card` |
| `card-bought` | `playerId`, `card` |
| `guess-locked` | `slot` |
| `contest-opened` | `deadline` |
| `contested` | `playerId`, `slot` |
| `passed` | `playerId` |
| `card-revealed` | `reveal` |
| `turn-passed` | `playerId`, `reason` (`timeout`, `offline` or `removed`) |
| `audio-missing` | none |
| `game-over` | `winners`, `reason` |

Huehint events. None carries the secret color or a guess before the reveal, because every member receives the same events:

| `type` | Fields |
|---|---|
| `game-started` | none |
| `round-started` | `round` (1-based), `giverId` (`null` in solo) |
| `hint-given` | `hint` |
| `memorize-ended` | none (solo: the color hides and guessing opens) |
| `guess-submitted` | `playerId` |
| `round-revealed` | `round` (`HuehintRoundView`) |
| `round-canceled` | `giverId` (the giver left during the hint) |
| `game-over` | `winners`, `reason` |

### `ChatMessage`

```ts
| { id; kind: "user"; memberId; name; avatar; text; at }
| { id; kind: "system"; text; at }
```

System messages announce joins, leaves, kicks, a new owner, the start of a game and its winners. The texts are in Portuguese.

## `ErrorCode`

| Code | Meaning |
|---|---|
| `invalid-session` | Unknown session or the member no longer exists |
| `room-not-found` | The room expired or never existed |
| `name-taken` | Another member has the same name, ignoring case and accents |
| `room-full` | The room has 20 members |
| `not-owner` | The action needs the owner |
| `invalid-target` | Kick target is yourself or already gone |
| `rate-limited` | More than 5 chat messages in 5 s |
| `invalid-message` | Empty or longer than 500 characters |
| `invalid-input` | The payload failed validation |
| `spotify-disconnected` | No Spotify connection, or Spotify revoked it |
| `playlist-invalid-link` | The link is not a playlist link |
| `playlist-no-access` | The connected account cannot read the playlist |
| `playlist-empty` | The playlist has no usable tracks, or too few to start a game |
| `playlist-exhausted` | Every song was already played in this room |
| `no-deck` | The room has no playlist yet |
| `game-running` | The action needs no running game |
| `no-game` | The action needs a game |
| `not-your-turn` | Only the turn player (Hitline) or the giver (Huehint hint) can do this, or the giver tried to guess |
| `wrong-phase` | The action does not apply in the current phase |
| `insufficient-tokens` | Not enough tokens |
| `already-bought` | One purchase per turn |
| `slot-taken` | Another player already holds this slot |
| `invalid-slot` | The slot does not exist |
| `already-decided` | You already contested or passed |
| `not-a-player` | You are a spectator |
| `invalid-hint` | Huehint: the hint breaks the length, word, digit or `#` rule |
| `already-guessed` | Huehint: you already guessed this round |
| `server-error` | Unexpected failure on the server |
| `timeout` | Client only: no ack arrived in time |

## HTTP routes

| Route | Body or query | Success | Errors |
|---|---|---|---|
| `GET /health` | none | `200 { status: "ok", redis: "ok" \| "down" }` | none |
| `POST /rooms` | `{ name, avatar }` | `201 { code, memberId, sessionToken }` | 400 on invalid body |
| `GET /rooms/:code` | none | `200 { code }` | `404 { error: "room-not-found" }` |
| `POST /rooms/:code/members` | `{ name, avatar }` | `201 { memberId, sessionToken }` | `404 room-not-found`, `409 name-taken` or `room-full` |
| `GET /audio/:drawId?m=<memberId>&t=<ticket>` | none | `200` full mp3 or `206` partial content, with `Cache-Control: no-store` and `Accept-Ranges: bytes` | `404 { error: "not-found" }` for every failure, `416` for an invalid range |
| `POST /admin/login` | `{ password }` | `200 { adminToken }` | `401 invalid-password`, `429 too-many-attempts` |
| `GET /admin/spotify/status` | Bearer `adminToken` | `200 { connected, configured }` | `401 unauthorized` |
| `POST /admin/spotify/authorize` | Bearer `adminToken` | `200 { authorizeUrl }` | `401 unauthorized`, `503 spotify-not-configured` |
| `GET /admin/spotify/callback?code&state` | none | `302` to `<WEB_URL>/admin/spotify?status=connected` | `302` to `?status=error` for a bad `state` or code, `503 spotify-not-configured` |
| `POST /admin/spotify/disconnect` | Bearer `adminToken` | `204` | `401 unauthorized` |

`name` is 1 to 20 characters after trim. `avatar` is `{ hue: 0 to 359, shape }`, where `shape` is one of `round`, `boxy`, `organic`, `cloud`, `sun`, `nub`, `capsule`, `triangle`, `hexagon`, `droplet`. A room code is 5 letters from `ABCDEFGHJKMNPQRSTUVWXYZ` (no `I`, `L` or `O`) and the API accepts it in any case.
