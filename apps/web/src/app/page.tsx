import { HomeActions } from "@/components/home-actions";
import { SiteBar } from "@/components/site-bar";
import { PageHeader } from "@/components/ui/page-header";

export default function HomePage() {
  return (
    <>
      <SiteBar />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[720px] flex-col gap-12 px-4 py-12 sm:px-6"
      >
        <PageHeader
          title={
            <>
              <span className="font-normal">Resenh</span>ARK
            </>
          }
          description="Uma sala para reunir o time, conversar e jogar."
        />
        <HomeActions />
      </main>
    </>
  );
}
