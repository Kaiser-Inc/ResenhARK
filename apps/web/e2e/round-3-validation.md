# Rodada 3 — validação do frontend

Branch: `feat/round-3-ui-ux-web`, baseada em `ef4fc99`.

## Fechamento e integração — 2026-10-07

As decisões e evidências desta seção substituem as limitações de movimento do registro original abaixo.

- Timelines públicas do placar e resultado reutilizam `TimelineCardRow`: ano, título e artistas, texto completo em `title`, lista acessível, sem scroll interno e destaque de 1 s apenas por cor. Duas pessoas e 15 cartas foram verificadas.
- O SVG oficial da KaiserInc compõe a vela/balão, monta suas seis peças na entrada da Home e acompanha o barco, inclusive no carregamento de sala.
- Movimento completo independentemente de `prefers-reduced-motion`, conforme direção explícita do produto: balanço de até 5° em 4,8 s, flutuação, ondas, parallax dos cards, flip, scramble do CTA, borda externa animada, transição de sala, reações, revelações, contagem e confetti. Listas de músicas permanecem estáveis para leitura.
- O texto pequeno “Sala de jogos do time” foi removido da Home. O nome ResenhARK e os metadados foram preservados.
- Foco dos cards corrigido; mouse, teclado, toque sintetizado, interrupções de hover e recuperação após erro de criação foram exercitados.
- Os três adendos desta revisão alteram fontes somente em `apps/web`; o lockfile registra o anime.js solicitado anteriormente.
- Lint e typecheck de web, API e shared passaram no checkout integrado. Testes: 29 web, 343 API e 11 shared, todos verdes.
- Regressão final integrada: 153/153 cenários Chromium passaram em uma execução completa, sem retries (12,4 min).
- Capturas adicionais: `8-player-timelines`, `8-player-timelines-result`, `9-home-kaiser-mark` e `10-home-immersive`, todas a 390/1440 px nos dois temas, com axe sem violações. O checkpoint `2-hitline` também foi atualizado.
- Evidências: `/home/kaiser/KaiserInc/ResenhARK/.dev-flow/2026-10-06-rodada-3-ui-ux/ui/`. Logs persistentes finais: `/home/kaiser/KaiserInc/ResenhARK-integration/.dev-flow/2026-10-07-integrated-validation/{shared,api,web,e2e}.log`.
- E2E integrado isolado: web 4012, API 3345 e Redis 12. Preview integrado em `http://localhost:4000/`, API 3333 e Redis 0, com fixtures locais de playlist e áudio.

### Integração

`feat/round-3-ui-ux-web` e `feat/round-4-default-deck` foram integradas na `develop` sem conflitos. A segunda branch adiciona o baralho de 500 músicas e refinamentos de regras/áudio. Configurações locais não commitadas permaneceram nos seus checkouts.

Os e2e de integração verificam as 500 músicas do novo baralho e aguardam os fades de revelação do Huehint antes de medir contraste com axe, mantendo todas as regras da análise habilitadas.

## Registro original das sete fatias — 2026-10-06

As contagens, restrições de movimento e limites de escopo abaixo correspondem à entrega anterior aos adendos e ao pedido posterior de merge/PR.

## Entrega por fatia

| Fatia | Resultado | Escolha de implementação |
| --- | --- | --- |
| 1 | Opções fixas do Huehint e Próxima cor no solo | Enter ignora campos de texto e controles interativos; o botão aguarda a nova projeção. |
| 2 | Timeline de 15 cartas com rolagem da página | Rodapé fixo no celular e carta sticky no desktop; chat mantém sua rolagem independente. |
| 3 | Logo leva à Home com confirmação em partida | Voltar pelo logo preserva a sessão para reentrada; a ação existente de sair revoga a sessão. |
| 4 | Baralho padrão, restauração e importação | O nome importado pode truncar visualmente, mantendo o nome completo em title. |
| 5 | Regras no lobby e no Sheet | Uma fonte de copy aprovada; a versão completa acrescenta as configurações atuais, sem inventar explicações. |
| 6 | Home, barco, cards e metadata | SVG reutiliza as peças do logo; a imagem Open Graph é estática e reproduzível. |
| 7 | Reações de avatar | Debounce de 350 ms ao digitar, reação de 1 s na aparência/entrada, sem loops; troca seca com reduced-motion. |

## Evidências

- `pnpm lint`, `pnpm typecheck` e `pnpm test`: verdes; 325 testes da API, 11 do shared e 25 do web.
- Cada fatia começou com um teste que falhou antes da implementação.
- Playwright usa Chromium, com toque sintetizado nos testes de cards e seletor de cor. Dispositivo físico não foi validado.
- Os checkpoints novos verificam axe sem violações, ausência de overflow horizontal e 390/1440 px nos temas escuro e claro; também verificam overflow a 768 px.
- 40 capturas das sete fatias foram inspecionadas em `/home/kaiser/KaiserInc/ResenhARK/.dev-flow/2026-10-06-rodada-3-ui-ux/ui/`.
- Os 19 itens do KaiserInc Base foram conferidos nas capturas e no código, considerando as exceções aprovadas abaixo.
- Detector Impeccable nos arquivos de UI alterados: `[]`, salvo em `ui/impeccable-final.json` na pasta da rodada.
- Contraste foreground/superfície dos jogos: Hitline 6,97:1 escuro e 12,28:1 claro; Huehint 7,73:1 escuro e 12,21:1 claro. Croma abaixo de 0,17.
- Regressão E2E: 139/141 passaram na execução completa (9,7 min). As duas falhas eram dos testes: um seletor de texto ambíguo após a inclusão das regras recolhidas e uma leitura de estilo durante a remontagem responsiva da timeline. Após tornar o seletor exato e aguardar o estilo atual, os dois cenários passaram em uma repetição de 6 testes (2 min), junto dos quatro testes de avatar. Assim, os 141 cenários têm resultado verde; não houve uma segunda execução completa após esses ajustes exclusivamente nos testes.
- Logs locais: `/tmp/resenhark-r3-final-e2e.log` (execução completa), `/tmp/resenhark-r3-final-rerun.log` (6 verdes), `/tmp/resenhark-r3-final-lint.log`, `/tmp/resenhark-r3-s7-types.log` e `/tmp/resenhark-r3-s7-test.log`.

Os testes usam `E2E_BASE_URL=http://localhost:4011`, `E2E_API_URL=http://127.0.0.1:3344` e `E2E_REDIS_URL=redis://localhost:6379/12`. Não reutilizam servidores existentes. O preview fica em `http://localhost:4000`, API 3333, Redis 13, com fixtures de playlist e áudio.

## Auditoria técnica final

Implementação coerente com o produto e com a Base; o detector não apontou desvios nos arquivos alterados. A avaliação abaixo é uma revisão de código e das capturas, não uma certificação de acessibilidade ou medição de Core Web Vitals.

| Dimensão | Nota / 4 | Evidência ou limite |
| --- | --- | --- |
| Acessibilidade | 3 | Teclado, foco, Esc, descrição dos cards, axe e reduced-motion verificados; exceção conhecida do barco. |
| Performance | 3 | Movimento novo usa transform/opacity; SVGs locais e imagem OG estática. Core Web Vitals não medidos. |
| Responsividade | 3 | Capturas, overflow, rodapé e toque em Chromium; falta validação em dispositivo físico. |
| Temas | 4 | Tokens, dois temas completos e contraste medido nas superfícies dos jogos. |
| Integridade | 4 | Registry existente, copy compartilhada, contratos/projeções preservados, sem dependências novas. |
| Total | 17/20 | Nenhum novo bloqueio funcional identificado na revisão. |

### Exceções e limites

- **P1 conhecido e aprovado:** barco em loop sem pausa, contrariando WCAG 2.2.2. Amplitude máxima de 2°, período de 6 s e parada com reduced-motion. Decisão registrada em `frontend.md`; não tratar axe verde como conformidade WCAG completa.
- Tokens por jogo e rotação dos cards são as outras duas exceções aprovadas. Os alvos de 32 px seguem a decisão explícita da Base.
- Open Graph usa `NEXT_PUBLIC_SITE_URL` quando definida; o fallback local é `http://localhost:4000`. O domínio de produção não foi fornecido.
- Spotify e áudio reais não foram exercitados neste ambiente de fixtures. A rota de administração foi preservada e seus fluxos existentes foram testados.
- A revisão externa por outro agente não foi executada nesta tarefa.

## Fora do escopo

Backend, shared, configurações locais de ngrok, push e merge. Também ficaram fora as funcionalidades da rodada 4: curadoria de 500 músicas, carrossel, olhos seguindo o cursor, aviso de duração e tratamento de salas legadas com meta superior a 15.
