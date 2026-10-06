# ResenhARK

Uma sala para reunir o time, conversar e jogar: entre com um código, converse em tempo real e jogue Hitline.

[English](README.en.md)

## Sobre

O ResenhARK nasceu para a Casual Daily do time de Kaiser, que acontece numa call do Google Meet. Voz e vídeo continuam no Meet, fora do app. O ResenhARK cuida do resto: alguém cria uma sala e compartilha o código, cada pessoa entra só com um nome e um avatar blobatar, sem conta, e a sala tem chat em tempo real e um jogo.

O primeiro jogo é o Hitline, uma linha do tempo de músicas. Você ouve um trecho de 30 s, escolhe onde a música entra na sua linha do tempo (pelo ano de lançamento) e o resto da sala pode contestar. As músicas vêm de uma playlist do Spotify. O servidor decide tudo, e cada pessoa recebe só o que pode ver.

## Recursos

| Recurso | Status |
|---|---|
| Sala por código, com nome e avatar blobatar, sem cadastro | Disponível |
| Chat em tempo real, com histórico das últimas 200 mensagens | Disponível |
| Hitline: linha do tempo de músicas, fichas, contestação | Disponível |
| Huehint: jogo de cores por dica, em grupo ou solo | Backend pronto, interface em construção |
| SiteSpy | Em breve |
| Codetalk | Em breve |

## Stack

| Parte | Tecnologia |
|---|---|
| Monorepo | pnpm + Turbo |
| `apps/api` | Fastify 5, Socket.IO, Zod, Redis |
| `apps/web` | Next 16, React 19, Tailwind 4, registry `@kaiserinc` (KaiserInc Base) |
| `packages/shared` | Contratos Zod usados pela api e pelo web |
| Qualidade | Biome, `tsx --test`, Playwright |

## Início rápido

Você precisa de Node 22, pnpm 9.15 e Docker (para o Redis).

```sh
make up        # Redis em localhost:6379
pnpm install   # ou: make install
make dev       # web e api
```

- Web: http://localhost:4000
- API: http://127.0.0.1:3333

Sem nenhum arquivo `.env`, o baralho de desenvolvimento funciona sem Spotify. Para jogar a primeira partida, siga o [tutorial](docs/tutorial-first-game.md).

## Estrutura

```text
apps/
  api/            Fastify + Socket.IO + Redis
  web/            Next.js (interface e testes e2e)
packages/
  shared/         schemas e tipos compartilhados
docs/             documentação (em inglês)
```

## Documentação

A documentação fica em [`docs/`](docs/README.md), em inglês:

- Tutorial: [seu primeiro jogo](docs/tutorial-first-game.md)
- Como fazer: [conectar o Spotify](docs/how-to/connect-spotify.md), [fazer o deploy](docs/how-to/deploy.md), [rodar os testes](docs/how-to/run-tests.md)
- Referência: [variáveis de ambiente](docs/reference/environment-variables.md), [eventos em tempo real](docs/reference/realtime-events.md), [regras do Hitline](docs/reference/hitline-rules.md)
- Explicação: [arquitetura](docs/explanation/architecture.md), [informação oculta](docs/explanation/hidden-information.md), [limites conhecidos](docs/explanation/known-limits.md)

## Desenvolvimento

```sh
pnpm test                    # unitários e integração (precisa do Redis: make up)
pnpm typecheck
pnpm lint
pnpm --filter web test:e2e   # Playwright, build de produção do web
make down                    # para o Redis
```

Os detalhes dos testes estão em [rodar os testes](docs/how-to/run-tests.md).

## Licença

[MIT](LICENSE)
