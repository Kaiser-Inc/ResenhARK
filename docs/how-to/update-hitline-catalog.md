# Update the Hitline catalog

The genres source of Hitline plays songs from a catalog of Deezer songs, `apps/api/src/app/games/hitline/catalog.json`. A script builds it from a list of editorial Deezer playlists, and a GitHub Actions workflow runs that script every week. This page covers both: changing the playlists the catalog reads, and running the script by hand.

The script only adds songs. A song already in the catalog is never looked up again or removed.

## What each song carries

| Field | Meaning |
|---|---|
| `id` | `cat-<deezerId>` |
| `deezerId`, `isrc` | The Deezer track, used to fetch its 30 s clip, and its recording code |
| `title`, `artists` | As Deezer names them. The title is Deezer's short title, without "(Remastered 2007)" and similar |
| `year` | The earlier of the MusicBrainz first release year and the Deezer album year |
| `yearVerified` | `true` when MusicBrainz knew the recording |
| `genre` | The Deezer genre of the album, or `-1` ("Outros") |
| `rank` | Deezer popularity, at least `minRank` |

Remasters and compilations only date later than the original, so the earlier of the two years is the closer one. Years before 1920 or after the current year are ignored as placeholders.

## Change the playlists

Edit `apps/api/src/scripts/catalog/sources.json`:

```json
{
  "minRank": 300000,
  "genres": { "152": [1306931615, 1202660313], "80": [1082925547] },
  "decades": [5447818102, 5450130222]
}
```

- `genres` maps a Deezer genre id to playlists of that genre. The script also reads the genre's chart. The ids the game uses are the ones in `HITLINE_GENRES` (`packages/shared/src/hitline-catalog.ts`). A genre outside that list does not show in the lobby.
- `decades` lists playlists of older songs, so the catalog is not only made of current hits.
- `minRank` drops songs below that Deezer popularity.

The playlist only says where to look. A song's genre still comes from its album, so a song found in a rock playlist can land in "Pop".

Prefer playlists by Deezer's editors. Mood playlists ("sleep", "lofi", "coffee") bring songs nobody can place by year.

## Run the script

You need Node 22, pnpm and internet access. The script calls the public Deezer and MusicBrainz APIs.

```sh
pnpm --filter api exec tsx src/scripts/catalog/build.ts             # every new song
pnpm --filter api exec tsx src/scripts/catalog/build.ts --limit 30  # only the first 30 new songs
```

For each new song, the script reads the Deezer track, the Deezer album and the MusicBrainz release date. MusicBrainz allows one request per second, so a new song takes about 2 seconds. Building the catalog from scratch took a little over 3 hours for 5,900 songs. A weekly run only looks up what is new.

Answers are cached in `apps/api/node_modules/.cache/catalog.json`, saved every 20 songs. You can stop the script and run it again without losing what it already looked up. A lookup that fails is skipped and tried again on the next run.

The script writes the catalog and `apps/api/src/scripts/catalog/report.md`, which lists the songs per genre and per decade, the songs the popularity cut dropped and the new songs whose year MusicBrainz did not confirm.

## Check and commit

```sh
pnpm --filter api test
```

`catalog.test.ts` checks that the catalog has at least 3,000 songs, that ids and ISRCs are unique, that every year, genre and popularity is valid, that every decade from the 60s has songs, and that a draw over the whole catalog takes less than 100 ms. Commit the catalog and the report together. Biome skips `catalog.json` because the file is larger than its 1 MiB limit.

## The weekly workflow

`.github/workflows/hitline-catalog.yml` runs the script every Monday at 09:00 UTC, and on demand from the Actions tab (**Run workflow**). When the catalog changed, it pushes the result to the `chore/hitline-catalog` branch and opens a pull request into `main` with the report as its description. If last week's pull request is still open, the workflow updates it instead of opening another.

The workflow needs the repository setting **Settings > Actions > General > Allow GitHub Actions to create and approve pull requests**. Without it, the run pushes the branch but fails to open the pull request.

Review the pull request like any other change: the report shows what came in, and a bad playlist shows up as a block of songs nobody knows.
