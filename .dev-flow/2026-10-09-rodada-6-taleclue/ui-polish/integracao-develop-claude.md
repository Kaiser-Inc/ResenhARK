# Taleclue — polish frontend para integração na develop

Data: 2026-10-10. Responsável pela integração: Claude.

## Checkout e base

- Worktree: `/home/kaiser/KaiserInc/ResenhARK-taleclue-polish`.
- Branch: `feat/taleclue-polish-web`.
- Base após `git fetch origin`: `9f3e873aa75ba9afa5e467b47f8bc9ce8e8622c3` (`origin/develop`). A condição de ancestralidade foi verificada antes de criar o worktree.
- Quatro commits locais, na ordem das fatias. Nenhum push ou merge realizado.
- Durante a execução, a referência `origin/develop` avançou para `e88b0c463083937c571fa009dfbc5bde295fb780` (`feat(web): use preset options for the Taleclue lobby config`). Este worktree preserva a base aprovada `9f3e873`; o novo commit de presets deve ser considerado na integração. Não houve merge nem alteração no formulário de configuração nesta branch.
- O avanço de presets altera `apps/web/src/components/lobby/taleclue-config-form.tsx`, `apps/web/src/lib/config-options.ts` e `apps/web/src/lib/config-options.test.ts`. Não há sobreposição de arquivos com os quatro commits de polish; a validação neste relatório corresponde ao checkout do polish, antes da integração.
- Checkout original e worktrees de outras sessões não foram usados para alterações de código. O diretório de screenshots no checkout original é o destino explicitamente pedido pelo Kaiser.

## Commits e comportamento

| Fatia | Commit | Resultado | Escolha |
|---|---|---|---|
| 1 | `c38ceb2` — `feat(web): highlight the Taleclue clue field` | Campo Pista antes da mão, largura completa, rótulo destacado e foco ao abrir a fase; pista recebida acima da mesa. | Mantive os controles de 32 px e usei tipografia, largura e anel roxo para o destaque. |
| 2 | `224aed1` — `feat(web): guide Taleclue reveals with focused motion` | Cinco passos de 2,4 s, destaques roxos, checks de ação, cartas reais com alt descritivo e miniaturas. | A deadline e o relógio do servidor determinam o passo atual, inclusive após reconexão; o restante dos 15 s mantém o resultado legível. |
| 3 | `99cf980` — `feat(web): add the Taleclue avatar board` | Trilha serpentina de 0 até a meta, blobatars sem ocultação na mesma casa, movimento casa a casa e legenda textual com pontos exatos. | Seis colunas na área estreita e dez na larga, medidas pela largura real do tabuleiro. Com 50 casas a 390 px, mantive todas as casas legíveis, usando a rolagem normal da página. |
| 4 | Commit que contém este relatório — `feat(web): add Taleclue home card and complete rules` | Terceiro card no grid da home, SVG próprio, flip por teclado/clique/toque; regras completas no lobby e Sheet. | Reaproveitei GameCard e GameRules. A fonte do texto e da tabela é `apps/web/src/lib/game-rules.ts`; meta e prazos vêm da configuração atual. |

## Aprovações do Kaiser

As cinco legendas do reveal foram aprovadas, nesta ordem: “Esta era a carta do narrador”, “Quem votou em quê”, “Pontos por acertar”, “Pontos das iscas”, “Avanço no tabuleiro”. Cada passo dura 2,4 s; total de 12 s.

A areia suave foi aprovada: `--game-taleclue: oklch(0.90 0.065 80)` no claro e `oklch(0.31 0.025 80)` no escuro. O texto usa `--foreground`. Contraste medido em Chromium: **13,10:1 no claro** e **10,69:1 no escuro**; cromas 0,065 e 0,025, abaixo de 0,17. Interações e foco continuam roxos.

Foi aprovado o texto completo implementado em `taleclueFullRules`: preparação, quatro fases e prazos, pontuação e bônus de isca sem limite, fim por pontos/empate/baralho/jogadores/encerramento pelo dono, ausência de pista/isca/voto, pausa e espectadores. O resumo curto da home continua o texto previamente aprovado da rodada 6.

## Contrato e privacidade

- A mão de 6 cartas, ou 7 cartas e 2 iscas com 3 jogadores, e a pontuação continuam sob autoridade do backend.
- `view.players[].position`, `points`, `config.targetPoints`, `acted`, `decoyCount` e os passos públicos do reveal alimentam a interface.
- O web não armazena nem deduz mãos de outros jogadores, autoria ou votos alheios antes da revelação.
- `taleclueThumbnail` é o único helper que deriva `.thumb.webp`. Mão e mesa usam 400×600; a ampliação usa a imagem 800×1200. `card.alt` descreve a arte.
- O avanço começa aos 9,6 s e termina aos 12 s. A montagem e a mudança de largura buscam a casa correspondente ao tempo transcorrido e reproduzem o trecho restante.
- Taleclue mantém animação mesmo com `prefers-reduced-motion`; a lógica dos demais jogos foi preservada. Foco, checks, nomes, números e anúncios de leitor de tela complementam a cor.

## Validação

Cada fatia começou com testes que falharam no comportamento ausente e foi concluída com testes verdes, antes do commit.

| Fatia | lint | typecheck | pnpm test no monorepo | E2E Taleclue |
|---|---|---|---|---|
| 1 | Passou | Passou | 549 testes | 6/6 |
| 2 | Passou | Passou | 552 testes | 6/6 |
| 3 | Passou | Passou | 556 testes | 7/7 |
| 4 | Passou | Passou | 558 testes (17 shared, 82 web, 459 API) | 9/9, dentro da suíte completa 173/173 |

E2E focado da fatia 4: **3/3**. Inclui contraste dos três tokens, flip do Taleclue por Enter/Espaço/clique/toque nos dois temas, regras completas em lobby e Sheet com configuração real (meta 40; pista 120 s; iscas 45 s; voto 30 s), contenção/devolução de foco e Escape.

A primeira execução da suíte completa foi interrompida após 166 testes aprovados, sem falhas registradas, antes de concluir os casos de partida do Taleclue. O log parcial foi preservado como `fatia-4-e2e-interrupted.log`. Na retomada, foi verificado que não havia Playwright nem servidores nas portas de teste; o Redis foi reiniciado com `COMPOSE_PROJECT_NAME=resenhark make up`. A suíte completa foi então repetida e terminou com **173/173 aprovados em 17,5 minutos, exit code 0**, incluindo os cenários existentes de Hitline e Huehint e os 9 cenários de Taleclue. Nenhum teste foi pulado.

Axe nas telas novas: sem violações serious ou critical. Os testes esperam o fim das transições de entrada antes da auditoria, para medir os tokens em seu estado estável.

Novos unitários em `apps/web/src/lib` verificam miniatura/alt, ordem e duração do reveal e reconexão, coordenadas de todas as casas para metas de 10 a 50, continuidade da serpentina, oito peões na mesma casa, caminho inclusivo e busca pelo tempo. O E2E confirma as casas de todos os peões depois de um reveal, inclusive posições limitadas pela meta com pontos maiores que ela.

## Evidência visual e Base

Screenshots em `/home/kaiser/KaiserInc/ResenhARK/.dev-flow/2026-10-09-rodada-6-taleclue/ui-polish/`:

- `fatia-1-{390,1440}-{dark,light}.png`: campo de pista.
- `fatia-2-{390,1440}-{dark,light}.png`: reveal.
- `fatia-3-{390,1440}-{dark,light}.png`: 50 casas, oito blobatars na mesma casa.
- `fatia-4-{390,1440}-{dark,light}.png`: home.
- `fatia-4-verso-{390,1440}-{dark,light}.png`: resumo no verso.
- `fatia-4-regras-{390,1440}-{dark,light}.png` e `fatia-4-regras-fim-{390,1440}-{dark,light}.png`: início e final do Sheet.

Imagens inspecionadas em cada fatia nos quatro pares de viewport/tema. Checklist Base: tokens existentes para foco e superfícies; token de jogo aprovado e contraste medido; Geist; controles de 32 px; SVG sem artes do baralho e sem degradê; texto pt-BR; foco visível; nenhum alert/confirm; sem corte horizontal. Pontos e posições têm texto equivalente para leitor de tela.

Logs locais, não versionados, ficam em `.dev-flow/2026-10-09-rodada-6-taleclue/ui-polish/` deste worktree (`fatia-N-lint.log`, `fatia-N-typecheck.log`, `fatia-N-test.log`, `fatia-4-e2e-focused.log`, `fatia-4-e2e-full.log`).

## Ambiente de testes

Redis já existente foi reutilizado com `COMPOSE_PROJECT_NAME=resenhark make up`, após conferir as labels do container e PONG. O make padrão inicialmente encontrou conflito no nome do container; nenhum container de outra sessão foi encerrado ou recriado.

E2E usa banco 14, API 3334 e web 4001, conforme o Playwright do repositório. A suíte constrói e inicia sua própria web de produção. Unitários/API usam sua configuração de testes (banco 15). Não foram encerrados servidores de outras sessões nas portas 3333/4000.

Para reproduzir no Ubuntu, dentro deste worktree:

```bash
export PATH="$HOME/.local/bin:$PATH"
COMPOSE_PROJECT_NAME=resenhark make up
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web test:e2e
```

## Fora do escopo e integração

Não houve mudança em `packages/shared`, `apps/api`, `apps/web/public/taleclue`, `apps/web/scripts/taleclue-deck`, `apps/api/.env.example` ou `apps/web/next.config.ts`. O contrato e o baralho necessários estavam presentes; não há pendência de backend para estas fatias.

Ficaram para depois a reorganização da home para muitos jogos e qualquer ajuste de regra/pontuação/baralho. Nenhuma funcionalidade pedida foi retirada em favor das barras; elas foram substituídas pelo tabuleiro.

Claude deve revisar e integrar os quatro commits desta branch na develop pelo fluxo acordado com Kaiser. Antes de integrar, conferir se a develop avançou e rodar novamente os checks no resultado integrado. Este trabalho entrega commits locais e evidências; não inclui push, merge ou deploy.
