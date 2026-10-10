import {
  HUEHINT_RANKS,
  type HitlineConfig,
  type HuehintConfig,
  type TaleclueConfig,
} from "@resenhark/shared";

/** Thresholds come from the same contract used by the game engine. */
export const HUEHINT_RANK_RULES = HUEHINT_RANKS.map(({ rank, min }, index) => ({
  rank,
  range:
    index === 0
      ? `${min * 100}% a 100%`
      : `${min * 100}% a menos de ${HUEHINT_RANKS[index - 1].min * 100}%`,
  result: index <= HUEHINT_RANKS.findIndex((entry) => entry.rank === "B") ? "Vitória" : "Derrota",
}));

export const GAME_RULES = {
  hitline: {
    name: "Hitline",
    players: "1 a 15 jogadores",
    summary: "Adivinhe o ano da música e monte sua linha do tempo.",
    shortRules: [
      "Toca um trecho de música e você encaixa a carta na sua linha do tempo, pelo ano de lançamento.",
      "Acertar título ou artista dá fichas, que servem para pular, comprar uma carta ou contestar.",
      "Vence quem completar a linha do tempo primeiro, com 5 a 15 cartas.",
    ],
    rules: [
      "Toca um trecho de música. Encaixe a música na sua linha do tempo pelo ano de lançamento.",
      "Acertou a posição, a carta é sua. Errou, ela vai para o descarte.",
      "Acertar título ou artista dá ficha. A ficha serve para pular a música, comprar uma carta ou contestar o palpite de outra pessoa.",
      "Vence quem completar a linha do tempo primeiro (de 5 a 15 cartas).",
    ],
  },
  huehint: {
    name: "Huehint",
    players: "Solo ou 2 a 15 jogadores",
    summary: "Uma dica, uma cor. Quem chega mais perto?",
    shortRules: [
      "Quem dá a dica vê uma cor e a descreve em até 4 palavras. Os outros recriam a cor.",
      "Cada palpite vale de 0 a 10, e quem deu a dica ganha a média da rodada.",
      "Jogue solo como um jogo de memória, em dupla de forma cooperativa com um amigo, ou numa competição em grupo.",
    ],
    rules: [
      'Na sua vez, só você vê uma cor. Dê um nome para ela em até 4 palavras, sem números. Ex.: "Vermelho McQueen".',
      "Os outros recriam a cor ajustando matiz, saturação e brilho.",
      "Cada palpite vale de 0 a 10, conforme o olho percebe a diferença. Quem deu a dica ganha a média da rodada.",
      "Todos dão dica (de 1 a 5 voltas), alternando a cada rodada. A tela mostra quem dá a dica agora e quem dá a próxima.",
      "Com exatamente 2 jogadores no início, vocês jogam em dupla: a nota e o rank são coletivos. B para vencer; A e S também são vitória.",
      "A nota da dupla soma as notas das rodadas, até 10 por rodada revelada. Durante a partida, o rank é provisório.",
      "Com 3 ou mais jogadores, vence a maior soma. Em empate, todos com a maior soma dividem a vitória.",
      "Se a partida for encerrada pelo dono ou por saída de jogador, a dupla fica sem rank, vitória ou derrota.",
      "Sozinho: a cor aparece por 5 s, e você recria de memória.",
    ],
  },
  taleclue: {
    name: "Taleclue",
    players: "3 a 8 jogadores",
    summary: "Uma pista, várias cartas. Encontre a carta do narrador.",
    shortRules: [
      "O narrador escolhe uma carta da mão e dá uma pista de até 30 caracteres.",
      "Os demais jogam uma isca (duas com três jogadores) e votam sem escolher cartas próprias.",
      "Alguns acertos dão três pontos ao narrador e a quem acertou; todos ou nenhum dão dois aos votantes. Votos em iscas dão um ponto ao dono.",
    ],
    rules: [
      "O narrador escolhe uma carta da mão e dá uma pista de até 30 caracteres.",
      "Os demais jogam uma isca (duas com três jogadores) e votam sem escolher cartas próprias.",
      "Alguns acertos dão três pontos ao narrador e a quem acertou; todos ou nenhum dão dois aos votantes. Votos em iscas dão um ponto ao dono.",
    ],
  },
} as const;

export type GameType = keyof typeof GAME_RULES;
export type RulesSetup =
  | { type: "hitline"; config: HitlineConfig }
  | { type: "huehint"; config: HuehintConfig }
  | { type: "taleclue"; config: TaleclueConfig };

export function currentSettings(setup: RulesSetup): string[] {
  if (setup.type === "taleclue")
    return [
      `Meta de pontos: ${setup.config.targetPoints}`,
      `Tempo da pista: ${setup.config.clueSeconds} s`,
      `Tempo das iscas: ${setup.config.decoySeconds} s`,
      `Tempo do voto: ${setup.config.voteSeconds} s`,
      `Máximo de jogadores: ${setup.config.maxPlayers}`,
    ];
  return setup.type === "hitline"
    ? [
        `Vence com ${setup.config.targetCards} cartas`,
        `Tempo de contestação: ${setup.config.contestSeconds} s`,
        `Tempo de palpite: ${setup.config.guessSeconds} s`,
        `Máximo de jogadores: ${setup.config.maxPlayers}`,
      ]
    : [
        `Voltas por jogador: ${setup.config.turnsPerPlayer}`,
        `Tempo da dica: ${setup.config.hintSeconds} s`,
        `Tempo de palpite: ${setup.config.guessSeconds} s`,
        `Máximo de jogadores: ${setup.config.maxPlayers}`,
      ];
}
