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
| API | 3334 | `apps/web/e2e/genre-api-fixture.ts`, with `NODE_ENV=test` |
| Web | 4001 | `next build --webpack && next start -p 4001`, a production build |

The API runs the real `apps/api/src/main.ts`. The fixture only swaps the genre catalog for a small, fixed one before the server starts, so lobby tests can count songs exactly. `E2E_API_WORKTREE` points the fixture at another checkout of the API.

The web server uses a production build because `next dev` locks `.next/dev` per project and could not run beside your own dev server. The first run builds the web app, with a 5 minute allowance.

Playwright never reuses a running server. If a port is taken, the run stops with "is already used". Pick other ports with `E2E_API_URL` and `E2E_BASE_URL`:

```sh
E2E_API_URL=http://127.0.0.1:3344 E2E_BASE_URL=http://localhost:4011 pnpm --filter web test:e2e
```

The production build writes to `apps/web/.next`. Do not run the e2e suite from the same checkout as a running `next dev`, or the two overwrite each other. Use a second git worktree instead.

The tests use one worker and one browser (Chromium). The suite plays real games between two browser contexts, and includes accessibility checks with axe, keyboard-only play and motion checks.

### Dedicated Redis database

E2E tests use Redis database 14. Before each run, the global setup flushes it (`E2E_REDIS_URL` overrides the URL, default `redis://localhost:6379/14`), because the seeded API reuses room codes and rooms outlive restarts. It then warms the API and the web routes so navigation stays fast.

To flush it by hand:

```sh
docker exec resenhark_redis redis-cli -n 14 flushdb
```

### Pinned environment

The e2e API gets a fixed environment, so a local `apps/api/.env` cannot change test behavior. This works because `dotenv` does not override variables that are already set in the process environment, and Playwright sets every one of them:

- `NODE_ENV=test`, `PORT` (3334 unless `E2E_API_URL` says otherwise), `REDIS_URL=redis://localhost:6379/14`
- `PLAYLIST_SOURCE=fixture` and `AUDIO_SOURCE=fixture` (the dev deck and a silent mp3)
- `ADMIN_PASSWORD=dev`, with `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REDIRECT_URI` set to empty strings
- `WEB_URL`, `CORS_ORIGIN` (`http://localhost:4001`) and `PUBLIC_API_URL` (`http://127.0.0.1:3334`)
- `TRUST_PROXY_HOPS=0`
- `E2E_SEED=1`, which seeds turn order, deck shuffle and room codes. The API honors it only when `NODE_ENV=test`.

The web server gets `NEXT_PUBLIC_API_URL=http://127.0.0.1:3334` and an empty `API_PROXY_URL`. Real environment variables beat `.env.local`, so e2e talks to the API directly and never goes through a dev proxy.

### Output

Playwright writes test results to `apps/web/output/playwright/test-results`, and the screenshot checkpoints go under `apps/web/output/playwright/`. `E2E_UI_DIR` moves the screenshots elsewhere. The `output/playwright` folder is ignored by git.

### Running one test

The full suite takes 20 to 25 minutes. To check one scenario, pass the file and a name filter, and repeat it to catch a timing problem:

```sh
pnpm --filter web exec playwright test e2e/round-8-lobby-genres.spec.ts -g "decades change" --repeat-each=20
```

Lobby chips change on click, before the server answers. A test that reads a count right after a click can read a value from before the server applied it. Wait for something the server sends, such as the change showing up in a second member's browser, before you compare values.

## Lint and types

```sh
pnpm lint        # biome check, via turbo
pnpm typecheck   # tsc --noEmit (the web app runs `next typegen` first)
```

## In the CI

Pull requests and pushes to `develop` and `main` run lint, typecheck and the unit and integration tests, plus a production build of the web app and a boot test of the API image. See [Run the CI checks and protect main](run-ci-and-protect-main.md) to reproduce each check and to make `main` require them.
