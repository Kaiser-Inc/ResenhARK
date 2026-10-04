# ResenhARK

pnpm + Turbo monorepo. Realtime rooms and games for small teams.

## Requirements

- Node >= 22
- pnpm 9.15
- Docker (Redis for local dev and integration tests)

## Commands

```sh
make install    # pnpm install
make up         # start Redis
make dev        # run apps
make lint       # biome
make typecheck  # tsc --noEmit
make test       # start Redis + run all tests
```

## Layout

- `packages/shared`: room rules and schemas shared by api and web (`@resenhark/shared`)
