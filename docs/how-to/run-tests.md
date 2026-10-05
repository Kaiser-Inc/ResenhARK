# Run the tests

There are three layers: unit tests, integration tests and end-to-end (e2e) tests. No test calls an external API (Spotify, Deezer, iTunes). Unit and integration tests run with `tsx --test`, and e2e tests run with Playwright.

You need the setup from the [tutorial](../tutorial-first-game.md) (Node 22, pnpm, Docker).

## Unit and integration tests

```sh
make test                    # starts Redis, then runs pnpm test (turbo): api, shared and web unit tests
pnpm test                    # the same without starting Redis; run `make up` first
pnpm --filter api test       # api only
pnpm --filter @resenhark/shared test
pnpm --filter web test       # web unit tests only
```

The api suite (`tsx --test --test-concurrency=1 "src/**/*.test.ts"`) mixes pure tests (the game engine, text normalization, projection) with `*.integration.test.ts` files. Integration tests start a real Fastify and Socket.IO server and talk to a real Redis, through `socket.io-client` and HTTP.

Integration tests use Redis database 15 on `redis://localhost:6379/15` and flush it at the start of each server. Do not keep anything you care about in db 15. The files run one at a time (`--test-concurrency=1`) because they share that database.

Spotify, Deezer and iTunes are replaced by fakes and recorded JSON fixtures.

## End-to-end tests

```sh
make up                                          # Redis must be running
pnpm --filter web exec playwright install chromium   # first time only
pnpm --filter web test:e2e
```

Playwright (`apps/web/playwright.config.ts`) starts its own servers on dedicated ports, so it can run beside your dev servers:

| Server | Port | How it runs |
|---|---|---|
| API | 3334 | `pnpm --filter api dev` with `NODE_ENV=test` |
| Web | 4001 | `next build --webpack && next start -p 4001`, a production build |

The web server uses a production build because `next dev` locks `.next/dev` per project and could not run beside your own dev server. The first run builds the web app, with a 5 minute allowance.

Playwright reuses a server that is already listening on those ports, except when the `CI` environment variable is set.

The tests use one worker and one browser (Chromium). The suite plays real games between two browser contexts, and includes accessibility checks with axe, keyboard-only play and motion checks.

### Dedicated Redis database

E2E tests use Redis database 14. Before each run, the global setup flushes it (`E2E_REDIS_URL` overrides the URL, default `redis://localhost:6379/14`), because the seeded API reuses room codes and rooms outlive restarts. It then warms the API and the web routes so navigation stays fast.

To flush it by hand:

```sh
docker exec resenhark_redis redis-cli -n 14 flushdb
```

### Pinned environment

The e2e API gets a fixed environment, so a local `apps/api/.env` cannot change test behavior. This works because `dotenv` does not override variables that are already set in the process environment, and Playwright sets every one of them:

- `NODE_ENV=test`, `PORT=3334`, `REDIS_URL=redis://localhost:6379/14`
- `PLAYLIST_SOURCE=fixture` and `AUDIO_SOURCE=fixture` (the dev deck and a silent mp3)
- `ADMIN_PASSWORD=dev`, with `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REDIRECT_URI` set to empty strings
- `WEB_URL`, `CORS_ORIGIN` (`http://localhost:4001`) and `PUBLIC_API_URL` (`http://127.0.0.1:3334`)
- `TRUST_PROXY_HOPS=0`
- `E2E_SEED=1`, which seeds turn order, deck shuffle and room codes. The API honors it only when `NODE_ENV=test`.

The web server gets `NEXT_PUBLIC_API_URL=http://127.0.0.1:3334` and an empty `API_PROXY_URL`. Real environment variables beat `.env.local`, so e2e talks to the API directly and never goes through a dev proxy.

### Output

Playwright writes test results to `.dev-flow/2026-10-04-rodada-1-sala-chat-hitline/ui/test-results`. `test-results` is in `.gitignore`.

## Lint and types

```sh
pnpm lint        # biome check, via turbo
pnpm typecheck   # tsc --noEmit (the web app runs `next typegen` first)
```
