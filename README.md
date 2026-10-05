# ResenhARK

Realtime rooms for small teams: a room with chat and a music game (Hitline) played over a Spotify playlist.
Monorepo (pnpm + Turbo): `apps/web` (Next.js), `apps/api` (Fastify + Socket.IO + Redis), `packages/shared` (rules and schemas used by both).

## Run locally

Requirements: Node >= 22, pnpm 9.15, Docker (Redis).

```sh
make up        # Redis on localhost:6379
pnpm install   # or: make install
make dev       # web on :4000, api on :3333
```

Defaults work without any `.env` (fixture playlist, dev admin password `dev`). Copy `apps/api/.env.example` and `apps/web/.env.example` to change them.

Other targets: `make lint`, `make typecheck`, `make test`, `make down`.

## Environment variables

API (`apps/api`, validated in `src/app/core/parse-settings.ts`; the process exits at boot on invalid values):

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables the required checks below. |
| `PORT` | `3333` | Render injects its own. |
| `REDIS_URL` | `redis://localhost:6379/0` | Use `rediss://` for Upstash (TLS is automatic). |
| `CORS_ORIGIN` | `http://localhost:4000` | The web origin, exactly, no trailing slash. |
| `WEB_URL` | `http://localhost:4000` | Where the admin Spotify callback sends you back. |
| `PUBLIC_API_URL` | `http://127.0.0.1:3333` | Public URL of the API (builds audio URLs). |
| `SESSION_SECRET` | dev value | Required in production, >= 32 chars. |
| `ADMIN_PASSWORD` | `dev` | Required in production, >= 12 chars. |
| `PLAYLIST_SOURCE` | `fixture` (dev), `spotify` (prod) | With `spotify`, all three `SPOTIFY_*` are required or boot fails. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | none | From the Spotify app. |
| `SPOTIFY_REDIRECT_URI` | none | `https://<api>.onrender.com/admin/spotify/callback`. |
| `AUDIO_SOURCE` | `real` | `fixture` serves a silent mp3 (e2e). |
| `TRUST_PROXY_HOPS` | `0` | Set `1` on Render. |
| `E2E_SEED` | none | Only honored when `NODE_ENV=test`. |

Web (`apps/web`): `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:3333`), inlined at build time.

## Tests

```sh
make test                          # starts Redis, runs unit + integration for api and shared, plus web unit
pnpm --filter api test             # api only (needs Redis from `make up`)
pnpm --filter web test:e2e         # Playwright, two browsers, fixture deck and audio
```

No test calls an external API (Spotify, Deezer, iTunes).

## Docker image (api)

```sh
docker build -f apps/api/Dockerfile -t resenhark-api .
docker run --rm -p 3333:3333 -e NODE_ENV=production -e SESSION_SECRET=... -e ADMIN_PASSWORD=... \
  -e REDIS_URL=rediss://... -e SPOTIFY_CLIENT_ID=... -e SPOTIFY_CLIENT_SECRET=... \
  -e SPOTIFY_REDIRECT_URI=... resenhark-api
```

Multi-stage on `node:22-alpine`, runs as the non-root `node` user. `@resenhark/shared` ships TypeScript source for dev and the web, so the image compiles it and repoints its export to `dist` (see the Dockerfile).

## Deploy (free tiers)

Do these in order. Nothing here is automated; each account is yours.

Render's blueprint pins `region: oregon`; pick the same region in Upstash (or change both together). Because the API refuses to boot in production without every variable, the order below matters. To smoke the deploy before Spotify exists, set `PLAYLIST_SOURCE=fixture` on Render (the `SPOTIFY_*` variables are then not required) and switch back later.

1. **Upstash Redis.** Create a free Redis database in the region matching Render's. Copy the `rediss://default:<password>@<host>:6379` URL.
2. **Spotify app.** [developer.spotify.com](https://developer.spotify.com/dashboard) > Create app, keep it in Development Mode, no redirect URI yet. The account that owns the app must have Premium (a Development Mode requirement). Copy Client ID and Secret. Only the admin ever logs in to Spotify; players never do, so the 5-user Development Mode cap does not affect the room. Add collaborators under User Management only if someone else will connect Spotify.
3. **Render API.** New > Blueprint > this repo (`render.yaml`). Fill the `sync: false` variables: `ADMIN_PASSWORD`, `REDIS_URL`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`. `SESSION_SECRET` is generated. `PUBLIC_API_URL`, `CORS_ORIGIN`, `WEB_URL` and `SPOTIFY_REDIRECT_URI` must be non-empty to boot, so use placeholders (`https://placeholder.invalid`) for now. Health check is `/health`. After the first deploy, read the real hostname `https://<service>.onrender.com` from the dashboard.
4. **Connect the two.** Set `PUBLIC_API_URL=https://<service>.onrender.com` and `SPOTIFY_REDIRECT_URI=https://<service>.onrender.com/admin/spotify/callback` on Render. Add that same redirect URI in the Spotify app settings, exactly.
5. **Vercel web.** Import the repo, framework preset Next.js, Root Directory `apps/web`, keep "Include files outside of the Root Directory in the Build Step" on (the web imports `packages/shared`), Node.js 22.x, env `NEXT_PUBLIC_API_URL=https://<service>.onrender.com`. Deploy and copy the Vercel URL.
6. **Back-fill Render.** Set `CORS_ORIGIN` and `WEB_URL` to the Vercel URL (no trailing slash). Render redeploys.

### First-use checklist

1. Open `https://<web>/admin/spotify`, enter `ADMIN_PASSWORD`, click connect, approve in Spotify. It must show "Conectado".
2. Create a room, share the code, join from a second browser.
3. Import the team playlist (the admin's Spotify account must be able to read it). Check the track count and the warning if it is too small for players x N x 2.
4. Start a match and play one round, including a challenge.

### Free-tier facts (checked 2026-10-05)

- Render free web services spin down after 15 minutes with no inbound HTTP or WebSocket traffic, and take about 1 minute to spin up. 750 free instance hours per workspace per month. Source: https://render.com/docs/free
- Upstash Redis free: 256 MB and 500,000 commands per month. Source: https://upstash.com/blog/redis-new-pricing

Plans change; recheck before relying on them.

**Wake the API about 1 minute before the daily** by opening the web app (the first request wakes it). Do not point an uptime pinger at it: it would keep the instance awake and spend the Redis budget on `/health` pings.

**Redis budget.** Each mutation (chat message, join, game action) is roughly 5 to 15 commands (room `SET`, `touch` with a `SCAN` plus `EXPIRE`s, chat `LPUSH`/`LTRIM`/`EXPIRE`, session reads). A 1-hour session at an aggressive 1 mutation per second is about 36k commands, so about 150k a month for weekly use, well under 500k.

## Known limits

- Single API instance: room state is cached in memory and rehydrated from Redis at boot. Do not scale to 2+ instances.
- Free-tier sleep: a room survives a sleep (state is in Redis), but connected clients drop and reconnect when the API wakes.
- Spotify Development Mode: the API works as one admin connection. The 5-user cap applies to Spotify accounts allowlisted on the app, and only the admin logs in.
- Audio previews come from Deezer, then iTunes; tracks with no preview are skipped or silent.

## Layout

- `packages/shared`: room rules and schemas shared by api and web (`@resenhark/shared`)
