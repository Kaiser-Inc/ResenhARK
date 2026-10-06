import { HeroBoat } from "@/components/brand/hero-boat";
import { HomeActions } from "@/components/home-actions";
import { GameCard } from "@/components/home/game-card";
import { SiteBar } from "@/components/site-bar";
import { PageHeader } from "@/components/ui/page-header";
import type { Metadata } from "next";

const description =
  "Crie uma sala, mande o código pro time e joguem juntos. Sem cadastro, direto do navegador.";

export const metadata: Metadata = {
  title: { absolute: "ResenhARK | Sala de jogos do time" },
  description,
  robots: { index: true, follow: true },
  openGraph: {
    title: "Qual vai ser a resenha de hoje?",
    description,
    type: "website",
    locale: "pt_BR",
    siteName: "ResenhARK",
  },
};

export default function HomePage() {
  return (
    <>
      <SiteBar />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-page flex-col gap-12 px-4 py-8 sm:px-6 lg:px-12 lg:py-12"
      >
        <section className="grid items-center gap-8 lg:grid-cols-2">
          <div className="order-2 flex min-w-0 flex-col gap-6 lg:order-1">
            <p className="text-sm font-medium text-primary-text">Sala de jogos do time</p>
            <PageHeader
              title={
                <>
                  Qual vai ser a <br />
                  resenha de hoje?
                </>
              }
              description={description}
            />
            <HomeActions />
          </div>
          <HeroBoat className="order-1 mx-auto max-w-[480px] lg:order-2" />
        </section>
        <section aria-labelledby="how-it-works" className="flex flex-col gap-6">
          <h2 id="how-it-works" className="text-xl leading-7 font-semibold">
            Como funciona
          </h2>
          <ol className="grid gap-6 lg:grid-cols-3">
            {["Crie a sala", "Compartilhe o código", "Escolha o jogo"].map((step, index) => (
              <li key={step} className="flex items-center gap-4">
                <span aria-hidden="true" className="font-mono text-sm text-muted-foreground">
                  0{index + 1}
                </span>
                <h3 className="text-base leading-6 font-semibold">{step}</h3>
              </li>
            ))}
          </ol>
        </section>
        <section aria-label="Jogos" className="grid gap-8 py-2 lg:grid-cols-2 lg:gap-12">
          <GameCard game="hitline" />
          <GameCard game="huehint" />
        </section>
      </main>
    </>
  );
}
