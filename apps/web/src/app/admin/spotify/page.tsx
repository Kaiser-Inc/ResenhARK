import type { Metadata } from "next";

import { AdminSpotify } from "@/components/admin/admin-spotify";
import { SiteBar } from "@/components/site-bar";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Spotify" };

export default function AdminSpotifyPage() {
  return (
    <>
      <SiteBar />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-12 sm:px-6"
      >
        <PageHeader
          title="Spotify"
          description="Conexão da conta que importa as playlists das salas."
        />
        <AdminSpotify />
      </main>
    </>
  );
}
