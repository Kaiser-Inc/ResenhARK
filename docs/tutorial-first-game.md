# Tutorial: your first game

You will run ResenhARK on your machine and play a solo Hitline game with the development deck. It takes about 15 minutes. You do not need Spotify.

You need Node 22, pnpm 9.15 and Docker.

## 1. Start the app

From the repository root:

```sh
make up        # starts Redis on localhost:6379
pnpm install
make dev       # starts the web app and the api
```

The web app is at http://localhost:4000 and the API at http://127.0.0.1:3333. Check the API:

```sh
curl http://127.0.0.1:3333/health
```

You should see `{"status":"ok","redis":"ok"}`.

> If `apps/api/.env` or `apps/web/.env.local` exist on your machine, they override the defaults this tutorial relies on (fixture playlist source, admin password `dev`). Move them aside, or set `PLAYLIST_SOURCE=fixture` in the api environment. See [Environment variables](reference/environment-variables.md).

## 2. Create a room

1. Open http://localhost:4000.
2. Click **Criar sala**.
3. Type a name in **Seu nome**, pick a color and a shape for your avatar, and click **Criar e entrar**.

You land on `/sala/<code>`, where the code is 5 letters. You are the owner of the room. The chat is on the side. The lobby opens on Hitline, and **Jogo da sala** lets you switch to Huehint or Taleclue.

## 3. Load the development deck

Hitline has three song sources under **Fonte das músicas**. **Gêneros** is marked by default. This tutorial uses the development deck, which comes in through the **Playlist** source.

1. Click **Playlist**.
2. In **Link da playlist**, paste `https://open.spotify.com/playlist/dev`.
3. Click **Importar playlist**.

The lobby shows "Baralho de desenvolvimento · 40 músicas". With the default fixture source the link is not read: any link that contains `playlist` loads the same 40-song deck. A link without `playlist` fails with "Link inválido".

## 4. Set the game to five cards

Open **Cartas para vencer** and pick `5`, the smallest choice. The first player to reach 5 cards in their timeline wins. You start with one card, so four correct guesses end the game.

Click **Iniciar partida**. You start with one revealed card and 2 tokens.

## 5. Draw and guess

1. Click **Puxar carta**. A 30 s clip plays. By default the API looks the clip up on Deezer and iTunes, so you need internet access. To get a silent clip instead, start the api with `AUDIO_SOURCE=fixture`. If a song has no preview, the game skips it and shows a notice.
2. Your timeline shows gaps: **Inserir** before and after your card. Pick the gap where you think the song belongs by release year.
3. Optionally type the song title and the artist. A close spelling counts.
4. Click **Travar palpite**.

Because you are the only player, nobody can contest. The game reveals the card right away.

## 6. Read the reveal

The **Virada** region shows the year, title and artist, whether your position was right, and whether you won a token. You earn a token when the position is right and the title or the artist is right, or when the position is wrong but both title and artist are right.

If the position was right, the card joins your timeline. If not, it is discarded.

## 7. Finish and play again

Repeat steps 5 and 6 until your timeline has 5 cards. The **Resultado** region shows you as the winner.

Click **Outra rodada**, at the top next to **Regras**. You return to the lobby with the same playlist, and the lobby now says how many songs remain. The songs already drawn in this room do not come back. Click **Iniciar partida** to play another game.

## Next steps

- Play with the genre catalog: click **Gêneros** under **Fonte das músicas**, vote for a genre under **Seu voto**, and unmark a decade under **Épocas** to see **músicas disponíveis** change. The clips come from Deezer, so you need internet access.
- Join the same room from a second browser to try the contest window, the genre votes and the chat: open the room URL and enter another name.
- Connect a real playlist: [Connect Spotify](how-to/connect-spotify.md).
- Learn every rule: [Hitline rules](reference/hitline-rules.md).
