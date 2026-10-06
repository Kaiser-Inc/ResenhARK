# Rebuild the built-in deck

Every room plays the built-in Hitline deck, "Baralho ResenhARK", until its owner imports a Spotify playlist. The deck lives in `apps/api/src/app/games/hitline/default-deck.json` and is generated from a curated list. This page changes the list and regenerates the deck.

You need Node 22, pnpm and internet access. The script calls the public Deezer and MusicBrainz APIs, so no test runs it.

## 1. Edit the list

The list is `apps/api/src/scripts/default-deck/candidates.json`. Each entry has the title, the artists as Deezer names them, the original release year and whether the song is Brazilian:

```json
{ "title": "Bohemian Rhapsody", "artists": ["Queen"], "year": 1975, "br": false }
```

Keep more candidates than the deck needs (about 600 for 500 songs), because some songs are removed. The year is the first release of the recording, usually the year of the original album, not of a later single or remaster.

## 2. Run the script

```sh
pnpm --filter api exec tsx src/scripts/default-deck/build.ts
```

For each candidate the script:

1. searches Deezer for "artist title" and keeps the studio recording whose title and artist match, rejecting live, remix, karaoke, cover and acoustic versions;
2. reads that Deezer track to get its ISRC and checks that it has a 30 s clip;
3. asks MusicBrainz for the first release date of that ISRC, at one request per second.

A run of about 600 candidates takes 25 minutes. Answers are cached in `apps/api/node_modules/.cache/default-deck.json`, so a second run after small fixes takes seconds. Delete that file to look everything up again.

## 3. Read the report

The script writes `apps/api/src/scripts/default-deck/report.md`:

- **Removed**: songs with no matching Deezer track, no clip or no ISRC. Fix the spelling of the title or the artist in the list, or drop the song.
- **Divergent year**: songs whose list year and MusicBrainz year differ by more than one year. They stay in the deck with the list year. Check each one and correct the list when the list is wrong.

The deck keeps up to 500 songs, a quarter of them Brazilian when the list has enough. When one side has more accepted songs than it needs, the script keeps songs evenly spaced along the list, which is sorted by year, so no decade is cut.

## 4. Check and commit

```sh
pnpm --filter api test
```

The test in `default-deck.test.ts` checks the size (450 to 500), the years, the Deezer ids, the ISRCs, repeated songs and the Brazilian share. Commit the list, the deck and the report together.

Each card keeps its Deezer track id. The API asks Deezer for that exact track first, because a lookup by ISRC can return another release of the same recording without a clip.
