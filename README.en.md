# ResenhARK

A room for your team to get together, chat and play: join with a code, talk in real time and play Hitline.

[Português](README.md)

## About

ResenhARK was built for Kaiser's team Casual Daily, held on a Google Meet call. Voice and video stay in Meet, outside the app. ResenhARK covers the rest: someone creates a room and shares the code, everyone joins with just a name and a blobatar avatar, no account, and the room has real-time chat and a game.

The first game is Hitline, a music timeline. You hear a 30 s clip, pick where the song goes in your timeline (by release year), and the rest of the room can contest. Songs come from the built-in deck, or from a Spotify playlist the room owner imports. The server decides everything, and each person receives only what they are allowed to see.

## Features

| Feature | Status |
|---|---|
| Room by code, with name and blobatar avatar, no sign-up | Available |
| Real-time chat, with the last 200 messages as history | Available |
| Hitline: music timeline, tokens, contests | Available |
| Huehint: color guessing from a hint, in a group or solo | Backend ready, interface in progress |
| SiteSpy | Coming soon |
| Codetalk | Coming soon |

## Stack

| Part | Technology |
|---|---|
| Monorepo | pnpm + Turbo |
| `apps/api` | Fastify 5, Socket.IO, Zod, Redis |
| `apps/web` | Next 16, React 19, Tailwind 4, `@kaiserinc` registry (KaiserInc Base) |
| `packages/shared` | Zod contracts used by the api and the web app |
| Quality | Biome, `tsx --test`, Playwright |

## Quick start

You need Node 22, pnpm 9.15 and Docker (for Redis).

```sh
make up        # Redis on localhost:6379
pnpm install   # or: make install
make dev       # web and api
```

- Web: http://localhost:4000
- API: http://127.0.0.1:3333

With no `.env` file, the development deck works without Spotify. To play your first game, follow the [tutorial](docs/tutorial-first-game.md).

## Structure

```text
apps/
  api/            Fastify + Socket.IO + Redis
  web/            Next.js (UI and e2e tests)
packages/
  shared/         shared schemas and types
docs/             documentation
```

## Documentation

Documentation lives in [`docs/`](docs/README.md):

- Tutorial: [your first game](docs/tutorial-first-game.md)
- How-to guides: [connect Spotify](docs/how-to/connect-spotify.md), [deploy](docs/how-to/deploy.md), [run the tests](docs/how-to/run-tests.md)
- Reference: [environment variables](docs/reference/environment-variables.md), [realtime events](docs/reference/realtime-events.md), [Hitline rules](docs/reference/hitline-rules.md)
- Explanation: [architecture](docs/explanation/architecture.md), [hidden information](docs/explanation/hidden-information.md), [known limits](docs/explanation/known-limits.md)

## Development

```sh
pnpm test                    # unit and integration (needs Redis: make up)
pnpm typecheck
pnpm lint
pnpm --filter web test:e2e   # Playwright, production build of the web app
make down                    # stop Redis
```

Test details are in [run the tests](docs/how-to/run-tests.md).

## License

[MIT](LICENSE)
