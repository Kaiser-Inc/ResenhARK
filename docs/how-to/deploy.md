# Deploy

This guide puts ResenhARK online on free tiers: Upstash for Redis, Render for the API and Vercel for the web app. Nothing here is automated, and each account is yours.

Render's blueprint (`render.yaml`) pins `region: oregon`. Pick the same region in Upstash, or change both together.

Because the API refuses to boot in production without every required variable, the order below matters. To smoke the deploy before Spotify exists, set `PLAYLIST_SOURCE=fixture` on Render (the `SPOTIFY_*` variables are then not required) and switch back later. See [Environment variables](../reference/environment-variables.md) for every setting.

## Steps

1. **Upstash Redis.** Create a free Redis database in the region that matches Render's. Copy the `rediss://default:<password>@<host>:6379` URL.
2. **Spotify app.** Create the app as in [Connect Spotify](connect-spotify.md), but leave the redirect URI empty for now. Copy the Client ID and Secret.
3. **Render API.** Click New > Blueprint and pick this repository (`render.yaml`). Fill the `sync: false` variables: `ADMIN_PASSWORD`, `REDIS_URL`, `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`. Render generates `SESSION_SECRET`. `PUBLIC_API_URL`, `CORS_ORIGIN`, `WEB_URL` and `SPOTIFY_REDIRECT_URI` must be non-empty to boot, so use placeholders such as `https://placeholder.invalid` for now. The health check is `/health`. After the first deploy, read the real hostname `https://<service>.onrender.com` from the dashboard.
4. **Connect the two.** On Render, set `PUBLIC_API_URL=https://<service>.onrender.com` and `SPOTIFY_REDIRECT_URI=https://<service>.onrender.com/admin/spotify/callback`. Add the same redirect URI in the Spotify app settings, exactly.
5. **Vercel web.** Import the repository. Use the Next.js preset, Root Directory `apps/web`, Node.js 22.x, and keep "Include files outside of the Root Directory in the Build Step" on, because the web app imports `packages/shared`. Set `NEXT_PUBLIC_API_URL=https://<service>.onrender.com`. Deploy and copy the Vercel URL.
6. **Back-fill Render.** Set `CORS_ORIGIN` and `WEB_URL` to the Vercel URL, without a trailing slash. Render redeploys.

`NEXT_PUBLIC_API_URL` is inlined when the web app is built, so redeploy the web app after you change it.

## First-use checklist

1. Open `https://<web>/admin/spotify`, enter `ADMIN_PASSWORD`, click **Conectar Spotify** and approve in Spotify. The page must show "Conectado".
2. Create a room, share the code and join from a second browser.
3. Import the team playlist. The admin's Spotify account must be able to read it. Check the track count and the warning when the playlist is too small for players x N x 2.
4. Start a match and play one round, including a contest.

## Docker image (api)

Render builds this image from `apps/api/Dockerfile`. To build and run it yourself, from the repository root:

```sh
docker build -f apps/api/Dockerfile -t resenhark-api .
docker run --rm -p 3333:3333 -e NODE_ENV=production -e SESSION_SECRET=... -e ADMIN_PASSWORD=... \
  -e REDIS_URL=rediss://... -e SPOTIFY_CLIENT_ID=... -e SPOTIFY_CLIENT_SECRET=... \
  -e SPOTIFY_REDIRECT_URI=... -e PUBLIC_API_URL=... -e CORS_ORIGIN=... -e WEB_URL=... resenhark-api
```

The image is multi-stage on `node:22-alpine` and runs as the non-root `node` user. `@resenhark/shared` ships TypeScript source for dev and the web app, so the image compiles it and repoints its export to `dist` (see the Dockerfile).

## Free-tier facts (checked 2026-10-05)

- Render free web services spin down after 15 minutes with no inbound HTTP or WebSocket traffic, and take about 1 minute to spin up. Each workspace gets 750 free instance hours per month. Source: https://render.com/docs/free
- Upstash Redis free: 256 MB and 500,000 commands per month. Source: https://upstash.com/blog/redis-new-pricing

Plans change, so recheck them before you rely on them.

## Operating on free tiers

**Wake the API about 1 minute before the daily** by opening the web app. The first request wakes it. Do not point an uptime pinger at it: it would keep the instance awake and spend the Redis budget on `/health` pings.

**A sleep does not lose rooms.** State lives in Redis. Connected clients drop and reconnect when the API wakes, and the API rehydrates its timers at boot (see [Architecture](../explanation/architecture.md)).

**Redis budget.** Each mutation (chat message, join, game action) costs roughly 5 to 15 commands: the room `SET`, a `touch` with a `SCAN` plus `EXPIRE`s, the chat `LPUSH`/`LTRIM`/`EXPIRE`, and session reads. A 1-hour session at an aggressive 1 mutation per second is about 36,000 commands. Weekly use is about 150,000 commands a month, well under 500,000.
