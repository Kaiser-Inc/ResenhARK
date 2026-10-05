# Environment variables

The API validates its environment at boot in `apps/api/src/app/core/parse-settings.ts`. On an invalid value it prints the problem and exits. The API loads `apps/api/.env` through `dotenv`, and variables already set in the process environment win over the file.

"Required in production" means `NODE_ENV=production`.

## API (`apps/api`)

| Variable | Default | Required in production | Purpose |
|---|---|---|---|
| `NODE_ENV` | `development` | Set it to `production` | One of `development`, `test`, `production`. `production` turns on the required checks in this table. `test` turns request logging off and enables `E2E_SEED`. |
| `PORT` | `3333` | No | Port the API listens on (host `0.0.0.0`). Render injects its own. |
| `REDIS_URL` | `redis://localhost:6379/0` | Yes, in practice | Redis connection. A `rediss://` URL turns TLS on, as Upstash needs. The schema has a default, so boot does not fail without it. |
| `CORS_ORIGIN` | `http://localhost:4000` | Yes | The web origin, exactly, with no trailing slash. Used for HTTP CORS and for Socket.IO. |
| `WEB_URL` | `http://localhost:4000` | Yes | Where the Spotify callback redirects the browser (`<WEB_URL>/admin/spotify?status=connected` or `error`). |
| `PUBLIC_API_URL` | `http://127.0.0.1:3333` | Yes | Public URL of the API. Boot requires it in production; use the real hostname. |
| `SESSION_SECRET` | A fixed dev value | Yes, at least 32 characters | Signs audio tickets (HMAC). Changing it invalidates tickets of draws in progress. |
| `ADMIN_PASSWORD` | `dev` | Yes, at least 12 characters | Password for `/admin/login`. Compared in constant time. |
| `PLAYLIST_SOURCE` | `fixture` in dev and test, `spotify` in production | No | `spotify` or `fixture`. With `spotify`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REDIRECT_URI` must all be set or boot fails. `fixture` serves the 40-song development deck and ignores the link, except that it must contain `playlist`. |
| `SPOTIFY_CLIENT_ID` | none | When `PLAYLIST_SOURCE=spotify` | Client ID of the Spotify app. |
| `SPOTIFY_CLIENT_SECRET` | none | When `PLAYLIST_SOURCE=spotify` | Client secret of the Spotify app. |
| `SPOTIFY_REDIRECT_URI` | none | When `PLAYLIST_SOURCE=spotify` | `<api>/admin/spotify/callback`. It must match the redirect URI registered in the Spotify app exactly. Local: `http://127.0.0.1:3333/admin/spotify/callback`. |
| `AUDIO_SOURCE` | `real` | No | `real` looks previews up on Deezer, then iTunes. `fixture` serves a silent mp3 and skips the network (used by e2e). |
| `TRUST_PROXY_HOPS` | `0` | Set `1` behind Render | Number of proxies in front of the API whose `X-Forwarded-For` is trusted. It sets the client IP used by the admin login rate limit. |
| `E2E_SEED` | none | No | Integer that seeds the random generator (turn order, deck shuffle, room codes). The API ignores it unless `NODE_ENV=test`. |

If `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REDIRECT_URI` are all non-empty, the API enables the Spotify admin routes even with `PLAYLIST_SOURCE=fixture`. Without them, `/admin/spotify/authorize` answers 503 `spotify-not-configured`.

The values for `CORS_ORIGIN`, `WEB_URL` and `PUBLIC_API_URL` are required only in production, and the schema does not check their format.

The example file `apps/api/.env.example` lists the variables for local work.

## Web (`apps/web`)

| Variable | Default | Required in production | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:3333` | Yes | Base URL of the API for HTTP calls and the Socket.IO connection. Next inlines it at build time, so rebuild or redeploy after changing it. Put it in `apps/web/.env.local` for local work. |

## Fixed constants

These are not configurable. They are in the code.

| Value | Where |
|---|---|
| Room and session TTL, 6 hours, renewed on activity | `apps/api/src/app/repositories/room-store.ts` |
| Admin session, 1 hour; OAuth `state`, 10 minutes | `apps/api/src/app/http/routes/admin.routes.ts` |
| Chat limit, 5 messages per 5 s per member; admin login limit, 5 attempts per minute per IP | `socket-gateway.ts`, `admin.routes.ts` |
| Members per room: 20 | `apps/api/src/app/domain/room/room.ts` |
