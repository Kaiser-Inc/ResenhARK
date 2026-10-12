# ResenhARK

[![CI](https://github.com/Kaiser-Inc/ResenhARK/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaiser-Inc/ResenhARK/actions/workflows/ci.yml)

Board games for web hangouts with friends. What's today's resenha going to be? Create a room, send the code to the crew and play together. No sign-up, straight from the browser.

[Português](README.md) · [resenhark.vercel.app](https://resenhark.vercel.app)

## About

Someone creates a room and shares a 5-letter code. Everyone joins with just a name and a blobatar avatar, no account. The room has real-time chat, and the owner picks the game. Voice and video stay outside the app: the group talks on the call it already uses.

The server decides everything, and each person receives only what they are allowed to see. Another player's hand never reaches your browser, and the current song only arrives after the reveal.

ResenhARK started as the game room of a work team's casual daily, with a single game. It now has three games and works for any group. "Resenha" is Brazilian slang for a laid-back get-together, and the app itself is in Brazilian Portuguese.

## Games

**Hitline.** You hear 30 s of a song and pick where it goes in your timeline, by release year. The others can contest your guess with tokens. Songs come from a catalog of about 5,900 tracks: the table votes on genres and the owner picks the decades. You can also play the Baralho da galera, 500 hand-picked songs, or a Spotify playlist. Up to 15 players.

**Huehint.** One person sees a secret color and gives a hint in words. The others try to find the color on a picker, and the score comes from the distance between the colors. It works in a group, as a cooperative duo or as solo practice.

**Taleclue.** The narrator gives a clue for one of the illustrated cards in their hand. The others play similar cards as decoys, and the table votes on which one was the narrator's. 200 cards, for 3 to 8 players.

## Features

| Feature | Status |
|---|---|
| Room by code, with name and blobatar avatar, no sign-up | Available |
| Real-time chat, with the last 200 messages as history | Available |
| Hitline, with a genre and decade catalog, the Baralho da galera and Spotify playlists | Available |
| Huehint, in a group, as a duo or solo | Available |
| Taleclue, with 200 illustrated cards | Available |
| SiteSpy | Coming soon |
| Codetalk | Coming soon |

## Stack

| Part | Technology |
|---|---|
| Monorepo | pnpm + Turbo |
| `apps/api` | Fastify 5, Socket.IO, Zod, Redis |
| `apps/web` | Next 16, React 19, Tailwind 4, `@kaiserinc` registry (KaiserInc Base) |
| `packages/shared` | Zod contracts used by the api and the web app |
| Hitline catalog | Deezer and MusicBrainz, refreshed weekly by GitHub Actions |
| Quality | Biome, `tsx --test`, Playwright |
| CI | GitHub Actions: lint, typecheck, tests, web build and a boot test of the API image |

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
  api/            Fastify + Socket.IO + Redis, plus the deck scripts
  web/            Next.js (UI and e2e tests)
packages/
  shared/         shared schemas and types
docs/             documentation
.github/          workflows: CI and the weekly Hitline catalog refresh
```

## Documentation

Documentation lives in [`docs/`](docs/README.md):

- Tutorial: [your first game](docs/tutorial-first-game.md)
- How-to guides: [connect Spotify](docs/how-to/connect-spotify.md), [update the Hitline catalog](docs/how-to/update-hitline-catalog.md), [rebuild the Baralho da galera](docs/how-to/rebuild-default-deck.md), [deploy](docs/how-to/deploy.md), [run the tests](docs/how-to/run-tests.md), [run the CI checks and protect main](docs/how-to/run-ci-and-protect-main.md)
- Reference: [environment variables](docs/reference/environment-variables.md), [realtime events](docs/reference/realtime-events.md), rules for [Hitline](docs/reference/hitline-rules.md), [Huehint](docs/reference/huehint-rules.md) and [Taleclue](docs/reference/taleclue-rules.md)
- Explanation: [architecture](docs/explanation/architecture.md), [hidden information](docs/explanation/hidden-information.md), [known limits](docs/explanation/known-limits.md)

## Development

```sh
pnpm test                    # unit and integration (needs Redis: make up)
pnpm typecheck
pnpm lint
pnpm --filter web test:e2e   # Playwright, production build of the web app
make down                    # stop Redis
```

Test details are in [run the tests](docs/how-to/run-tests.md). Every pull request and every push to `develop` and `main` runs lint, typecheck, the tests, the web build and a boot test of the API image. To reproduce each check on your machine, see [run the CI checks and protect main](docs/how-to/run-ci-and-protect-main.md).

## License

[MIT](LICENSE)
