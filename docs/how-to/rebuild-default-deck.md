# Rebuild the built-in deck

Every room plays the built-in Hitline deck, "Baralho ResenhARK", until its owner imports a Spotify playlist. The deck lives in `apps/api/src/app/games/hitline/default-deck.json` and is generated from a curated list. This page changes the list and regenerates the deck.

You need Node 22, pnpm and internet access. The script calls the public Deezer and MusicBrainz APIs, so no test runs it.

## 1. Edit the list

The list is `apps/api/src/scripts/default-deck/candidates.json`. Each entry has the title, the artists as Deezer names them, the original release year and whether the song is Brazilian:

```json
{ "title": "Bohemian Rhapsody", "artists": ["Queen"], "year": 1975, "br": false }
```

Keep more candidates than the deck needs, because some songs are removed and the script trims the rest to 500. The current list has about 870 candidates, sorted by year. The year is the first release of the recording, usually the year of the original album, not of a later single or remaster.

## 2. Run the script

```sh
pnpm --filter api exec tsx src/scripts/default-deck/build.ts
```

For each candidate the script:

1. searches Deezer for "artist title" and adds the artist's 100 most played tracks, because the general search often ranks live versions and covers above the studio one;
2. keeps the recording whose title and artist match, ignoring accents, case, dots, apostrophes, a leading "The" in the artist and anything in parentheses or after " - " in the title;
3. rejects remix, karaoke, cover, acoustic and instrumental versions, and live versions too, except for a Brazilian song with no studio version (many sertanejo hits were first released live);
4. reads that Deezer track to get its ISRC and checks that it has a 30 s clip;
5. asks MusicBrainz for the first release date of that ISRC, at one request per second.

A first run of about 870 candidates takes 30 to 40 minutes. Answers are cached in `apps/api/node_modules/.cache/default-deck.json`, so a second run after small fixes takes seconds. Delete that file to look everything up again.

## 3. Read the report

The script writes `apps/api/src/scripts/default-deck/report.md`:

- **Removed**: songs with no matching Deezer track, no clip or no ISRC. Fix the spelling of the title or the artist in the list, or drop the song.
- **Divergent year**: songs whose list year and MusicBrainz year differ by more than one year. They stay in the deck with the list year. Most of them are MusicBrainz dating a remaster or a compilation; check each one and correct the list only when the list is wrong.
- **Live recordings**: Brazilian songs that went in as a live recording. Listen to a few if the choice matters.

The deck keeps up to 500 songs, a quarter of them Brazilian when the list has enough. When one side has more accepted songs than it needs, the script keeps songs evenly spaced along the list, which is sorted by year, so no decade is cut.

## 4. Check and commit

```sh
pnpm --filter api test
```

The test in `default-deck.test.ts` checks the size (450 to 500), the years, the Deezer ids, the ISRCs, repeated songs and the Brazilian share. Commit the list, the deck and the report together.

Each card keeps its Deezer track id. The API asks Deezer for that exact track first, because a lookup by ISRC can return another release of the same recording without a clip.
