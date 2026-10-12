import path from "node:path";
import { pathToFileURL } from "node:url";
import { HITLINE_GENRES } from "@resenhark/shared";

/** The real API and Socket.IO contract, with deterministic songs instead of a network-built catalog. */
async function startFixtureApi() {
  const root = process.env.E2E_API_WORKTREE ?? path.resolve(__dirname, "../../..");
  const api = path.join(root, "apps/api/src");
  const { CATALOG } = await import(
    pathToFileURL(path.join(api, "app/games/hitline/catalog.ts")).href
  );
  const cards = HITLINE_GENRES.flatMap((genre) => {
    const years =
      genre.id === 98
        ? [1955]
        : genre.id === -1
          ? []
          : genre.id === 132 || genre.id === 152
            ? [1955, 1965, 1975, 1985, 1995, 2005, 2015, 2025]
            : [1985, 1995, 2005];
    return years.flatMap((year) =>
      Array.from({ length: 4 }, (_, index) => ({
        id: `genre-fixture-${genre.id}-${year}-${index}`,
        title: `${genre.name} fixture ${year}-${index}`,
        artists: ["Fixture artist"],
        year,
        genre: genre.id,
        isrc: null,
        spotifyUrl: null,
      })),
    );
  });
  CATALOG.splice(0, CATALOG.length, ...cards);
  console.log("Using deterministic Hitline genre catalog for E2E");
  await import(pathToFileURL(path.join(api, "main.ts")).href);
}

void startFixtureApi();
