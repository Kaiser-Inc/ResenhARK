# Known limits

ResenhARK was built for one team playing on free tiers. These are the limits to know before you rely on it.

## One API instance

The server keeps per-room queues and timers in memory. A second instance would run the same room twice at once. Do not scale the API past one instance.

Scaling out needs a Redis lock instead of the in-memory queue, and the Socket.IO Redis adapter. The rate limiters (chat and admin login) and the audio clip cache are also per process. The code marks each of these spots with a `ponytail:` comment.

## Free-tier sleep

Render's free web service spins down after 15 minutes without traffic and takes about 1 minute to spin up. Rooms survive a sleep because the state is in Redis, but connected clients drop and reconnect when the API wakes. Wake it before a session. See [Deploy](../how-to/deploy.md).

Upstash's free Redis allows 500,000 commands a month. A normal weekly use stays well under, but a pinger or heavy traffic could spend it. The numbers were checked on 2026-10-05 and can change.

## Spotify Development Mode

- The app works with one admin connection. Players never log in.
- The app owner needs Premium.
- The cap of 5 allowlisted users applies to accounts you add in the Spotify dashboard, not to players.
- The connected account can read only playlists it owns or collaborates on, plus public ones.

## Audio previews

Previews come from Deezer (by ISRC), then iTunes (search by artist and title). Neither promises availability, and their terms cover promotional use. A track with no preview is skipped. After 10 skips in a row, the game ends.

A preview needs internet access from the API server, so offline development needs `AUDIO_SOURCE=fixture`.

## Safari and Range requests

The audio endpoint supports `Range`. The e2e suite runs on Chromium only. Safari's handling of partial content for audio has not been verified here.

## Network

Real-time features use WebSockets (Socket.IO). A network that blocks WebSocket traffic to an outside domain breaks the room. Check this before a session.

## Product limits

- A room holds up to 20 members. A game seats up to 15 players.
- Rooms expire 6 hours after the last activity. There is no account, history or running score.
- No moderation: you can remove a member but cannot ban one, and chat messages cannot be edited or deleted.
- The interface is in Brazilian Portuguese only.
- Voice and video are not in the app. Use Google Meet.
- SiteSpy and Codetalk are not built yet.
