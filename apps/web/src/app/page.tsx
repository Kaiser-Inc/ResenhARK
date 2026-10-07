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
          <div className="order-1 mx-auto flex w-full max-w-[480px] flex-col items-center lg:order-2">
            <HeroBoat />
            <p
              aria-label="ResenhARK"
              data-testid="hero-wordmark"
              className="text-[clamp(2.75rem,6vw,5rem)] leading-none font-extrabold tracking-[-0.055em]"
            >
              Resenh<span className="text-primary-text">ARK</span>
            </p>
          </div>
        </section>
        <section aria-labelledby="how-it-works" className="flex flex-col gap-6">
          <h2 id="how-it-works" className="text-xl leading-7 font-semibold">
            Como funciona
          </h2>
          <ol className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-4">
            {["Crie a sala", "Compartilhe o código", "Escolha o jogo"].map((step, index) => (
              <li
                key={step}
                className="relative flex items-center gap-4 lg:flex-1 lg:last:flex-none"
              >
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-base font-semibold text-primary-foreground"
                >
                  {index + 1}
                </span>
                <h3 className="text-base leading-6 font-semibold lg:shrink-0">{step}</h3>
                {index < 2 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-12 left-[19px] h-4 w-0.5 bg-primary-text/50 lg:static lg:h-0.5 lg:min-w-8 lg:flex-1"
                  />
                )}
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
