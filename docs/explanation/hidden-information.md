# Hidden information

In Hitline, the song you are about to place is secret until the reveal, and so are the cards left in the deck. The server holds them and never sends them to a client that should not see them. This page covers how it works.

## What stays on the server

The full game state lives in Redis and in server memory: the whole deck with titles, artists, years, ISRCs and Spotify links, the drawn card, and the turn player's typed guess. None of that goes to a browser as is.

## A projection per viewer

The server never sends the state. Each time it broadcasts, it builds a `RoomView` for each connected member with `projectRoom`, which calls `project` for the game. The view is built field by field. The code does not spread a state object, so a new field in the state cannot reach the client by accident. A comment in `project.ts` marks this on purpose.

What a viewer receives about the game:

| Data | What the viewer sees |
|---|---|
| Deck | Only `deckCount`. Never the cards |
| Drawn card | Only `{ id, audioUrl }`. No title, artist, year, ISRC or link |
| Turn player's guess | The slot for everyone. The typed title and artist only for the turn player, until the reveal |
| Timelines | Public cards of every player: title, artists, year and Spotify link |
| Discards, last reveal | Public cards, because they were already shown |

The `id` of a drawn card is a random per-draw id, not the id of the card in the deck. A `card-drawn` event carries only that draw id.

Engine events follow the same rule. Events such as `card-drawn` and `audio-missing` carry no card data, and a card appears in an event only when it becomes public (`card-skipped`, `card-bought`, `card-revealed`).

When a hidden card leaves play unrevealed (the turn player goes offline or is removed), it goes back to the bottom of the deck and no event names it.

Projection tests (`project.test.ts`, `project-room.test.ts`) check these rules.

## Audio without a leak

The clip must reach a browser `<audio>` element without revealing the song. The server uses its own endpoint.

1. The projection gives each viewer an `audioUrl` of the form `/audio/<drawId>?m=<memberId>&t=<ticket>`.
2. The ticket is `HMAC-SHA256(SESSION_SECRET, drawId + "\n" + memberId)`, base64url. It is tied to one draw and one member. It is also sent only in that member's own projection.
3. `GET /audio/:drawId` verifies the ticket in constant time. It then checks that the draw is the room's current draw and that the member is still in the room.
4. If all checks pass, the server finds a preview URL (Deezer by ISRC, then iTunes by artist and title), downloads the bytes and sends them itself. The provider URL, which would name the song, never reaches the client.

Every failure returns the same `404 { error: "not-found" }`: bad ticket, old draw, removed member, missing preview. A caller cannot tell which check failed.

The response carries `Cache-Control: no-store`. It supports one `Range` header, so browsers can seek, and answers `416` for an invalid range. The server keeps the last 20 downloaded clips in memory, so five people hearing the same card cause one download.

## The provider host allowlist

Before downloading a preview, the server checks the URL (`isAllowedAudioUrl` in `fetch-audio.ts`):

- The scheme must be `https`.
- The host must end in `dzcdn.net`, `itunes.apple.com` or `mzstatic.com`.

Anything else throws, so a bad provider response cannot make the server call an arbitrary host. The download also refuses redirects (`redirect: "error"`), stops after 10 seconds and caps the size at 2 MB. An empty body counts as a missing preview.

## What the client never receives

- The contents or order of the deck.
- The title, artist, year, ISRC or Spotify link of the drawn card before the reveal.
- The provider's preview URL.
- Other members' session tokens or audio tickets.
- The turn player's typed guess text before the reveal, for anyone but the turn player.

The chat renders as text, never as HTML.
