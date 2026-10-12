# ResenhARK

[![CI](https://github.com/Kaiser-Inc/ResenhARK/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaiser-Inc/ResenhARK/actions/workflows/ci.yml)

Plataforma de jogos de tabuleiro para web-rolês com os amigos. Qual vai ser a resenha de hoje? Crie uma sala, mande o código pra galera e joguem juntos. Sem cadastro, direto do navegador.

[English](README.en.md) · [resenhark.vercel.app](https://resenhark.vercel.app)

## Sobre

Alguém cria uma sala e compartilha um código de 5 letras. Cada pessoa entra só com um nome e um avatar blobatar, sem conta. A sala tem chat em tempo real, e o dono escolhe o jogo da vez. Voz e vídeo ficam fora do app: o grupo conversa na chamada que já usa.

O servidor decide tudo, e cada pessoa recebe só o que pode ver. A mão de outro jogador nunca chega ao seu navegador, e a música da vez só chega depois da revelação.

O ResenhARK começou como a sala de jogos da Casual Daily de um time de trabalho, com um jogo só. Hoje tem três jogos e serve para qualquer grupo.

## Jogos

**Hitline.** Você ouve 30 s de uma música e escolhe onde ela entra na sua linha do tempo, pelo ano de lançamento. Os outros podem contestar o palpite com fichas. As músicas vêm de um catálogo de cerca de 5.900 faixas: a mesa vota nos gêneros e o dono escolhe as épocas. Também dá para jogar com o Baralho da galera, de 500 músicas escolhidas a dedo, ou com uma playlist do Spotify. Até 15 jogadores.

**Huehint.** Uma pessoa vê uma cor secreta e dá uma dica em palavras. As outras tentam achar a cor num seletor, e a nota sai da distância entre as cores. Funciona em grupo, em dupla cooperativa ou como treino solo.

**Taleclue.** O narrador dá uma pista para uma das cartas ilustradas da mão dele. Os outros jogam cartas parecidas para confundir, e a mesa vota em qual era a do narrador. São 200 cartas, para 3 a 8 jogadores.

## Recursos

| Recurso | Status |
|---|---|
| Sala por código, com nome e avatar blobatar, sem cadastro | Disponível |
| Chat em tempo real, com histórico das últimas 200 mensagens | Disponível |
| Hitline, com catálogo por gênero e época, Baralho da galera e playlist do Spotify | Disponível |
| Huehint, em grupo, em dupla ou solo | Disponível |
| Taleclue, com 200 cartas ilustradas | Disponível |
| SiteSpy | Em breve |
| Codetalk | Em breve |

## Stack

| Parte | Tecnologia |
|---|---|
| Monorepo | pnpm + Turbo |
| `apps/api` | Fastify 5, Socket.IO, Zod, Redis |
| `apps/web` | Next 16, React 19, Tailwind 4, registry `@kaiserinc` (KaiserInc Base) |
| `packages/shared` | Contratos Zod usados pela api e pelo web |
| Catálogo do Hitline | Deezer e MusicBrainz, atualizado toda semana por GitHub Actions |
| Qualidade | Biome, `tsx --test`, Playwright |
| CI | GitHub Actions: lint, tipos, testes, build do web e boot da imagem da API |

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
  api/            Fastify + Socket.IO + Redis, e os scripts dos baralhos
  web/            Next.js (interface e testes e2e)
packages/
  shared/         schemas e tipos compartilhados
docs/             documentação (em inglês)
.github/          workflows: CI e atualização semanal do catálogo do Hitline
```

## Documentação

A documentação fica em [`docs/`](docs/README.md), em inglês:

- Tutorial: [seu primeiro jogo](docs/tutorial-first-game.md)
- Como fazer: [conectar o Spotify](docs/how-to/connect-spotify.md), [atualizar o catálogo do Hitline](docs/how-to/update-hitline-catalog.md), [refazer o Baralho da galera](docs/how-to/rebuild-default-deck.md), [fazer o deploy](docs/how-to/deploy.md), [rodar os testes](docs/how-to/run-tests.md), [rodar o CI e proteger a main](docs/how-to/run-ci-and-protect-main.md)
- Referência: [variáveis de ambiente](docs/reference/environment-variables.md), [eventos em tempo real](docs/reference/realtime-events.md), regras do [Hitline](docs/reference/hitline-rules.md), do [Huehint](docs/reference/huehint-rules.md) e do [Taleclue](docs/reference/taleclue-rules.md)
- Explicação: [arquitetura](docs/explanation/architecture.md), [informação oculta](docs/explanation/hidden-information.md), [limites conhecidos](docs/explanation/known-limits.md)

## Desenvolvimento

```sh
pnpm test                    # unitários e integração (precisa do Redis: make up)
pnpm typecheck
pnpm lint
pnpm --filter web test:e2e   # Playwright, build de produção do web
make down                    # para o Redis
```

Os detalhes dos testes estão em [rodar os testes](docs/how-to/run-tests.md). Todo pull request e todo push para `develop` e `main` roda lint, tipos, testes, o build do web e o boot da imagem da API. Para reproduzir cada check na sua máquina, veja [rodar o CI e proteger a main](docs/how-to/run-ci-and-protect-main.md).

## Licença

[MIT](LICENSE)
