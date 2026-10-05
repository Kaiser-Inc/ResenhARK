# Connect Spotify

Rooms import playlists through one Spotify connection owned by the admin. Players never log in to Spotify. This page connects that account so that any room owner can paste a playlist link.

You need a running API (see [Tutorial: your first game](../tutorial-first-game.md)) and a Spotify account with Premium.

## 1. Create the Spotify app

1. Open the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and click **Create app**.
2. Keep the app in Development Mode. The account that owns the app must have Premium, which Spotify requires for Development Mode.
3. Add the redirect URI. For local work use the loopback address, not `localhost`:

   ```text
   http://127.0.0.1:3333/admin/spotify/callback
   ```

   It must match `SPOTIFY_REDIRECT_URI` exactly. For an online API the URI is `https://<api-host>/admin/spotify/callback`.
4. Copy the Client ID and the Client Secret.

## 2. Configure the API

Set these in `apps/api/.env`:

```sh
PLAYLIST_SOURCE=spotify
SPOTIFY_CLIENT_ID=<client id>
SPOTIFY_CLIENT_SECRET=<client secret>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3333/admin/spotify/callback
ADMIN_PASSWORD=<password>
```

`ADMIN_PASSWORD` defaults to `dev` outside production. With `PLAYLIST_SOURCE=spotify` the API refuses to boot unless all three `SPOTIFY_*` variables are set. Restart the API.

## 3. Connect

1. Open `/admin/spotify` on the web app (for example http://localhost:4000/admin/spotify).
2. Enter the admin password and click **Entrar**. Five failed attempts per minute from one IP are rate limited.
3. Click **Conectar Spotify** and approve the access in Spotify. The requested scopes are `playlist-read-private` and `playlist-read-collaborative`.
4. You return to the admin page, which shows **Conectado**.

The refresh token is stored in Redis without expiry. The connection stays until you click disconnect or Spotify revokes it; then the page shows it as disconnected and imports fail with "Spotify desconectado".

The admin session lasts 1 hour.

## 4. Use a playlist

In a room, the owner pastes a playlist link in **Link da playlist** and clicks **Importar playlist**. The API accepts `https://open.spotify.com/playlist/<id>` links and `spotify:playlist:<id>` URIs.

The Spotify account you connected must be able to read the playlist. That means a playlist that account owns or collaborates on, or a public one. A collaborative playlist works when the connected account is a collaborator. Otherwise the import fails with "Sem acesso a esta playlist".

The import skips local files, episodes, duplicate tracks and tracks without a release year.

## Development Mode limits

- Only the admin logs in, so the cap of 5 allowlisted users does not affect rooms.
- Add other people under **User Management** in the Spotify dashboard only if they will connect Spotify themselves.
- The connected account needs Premium for as long as the app stays in Development Mode.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Senha incorreta" | `ADMIN_PASSWORD` differs from what you typed. Check that a local `.env` is not overriding `dev`. |
| Redirect error in Spotify | The redirect URI in the dashboard differs from `SPOTIFY_REDIRECT_URI`. Use `127.0.0.1`, not `localhost`. |
| Page says "Spotify não configurado no servidor" | One of the `SPOTIFY_*` variables is empty. |
| "Conexão cancelada" toast | The callback got an invalid `state` or Spotify rejected the code. Try again. |
