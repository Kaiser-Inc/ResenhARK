import { GameRules } from "@/components/game-rules";
import { SiteBar } from "@/components/site-bar";
import { PageHeader } from "@/components/ui/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Regras" };

export default function RulesPage() {
  return (
    <>
      <SiteBar />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-page flex-col gap-8 px-4 py-8 sm:px-6 lg:px-12"
      >
        <PageHeader
          title="Regras dos jogos"
          description="Escolha o jogo e veja como jogar com o time."
        />
        <section aria-label="Regras do Huehint">
          <GameRules game="huehint" headingLevel={2} />
        </section>
        <section aria-label="Regras do Hitline">
          <GameRules game="hitline" headingLevel={2} />
        </section>
      </main>
    </>
  );
}
