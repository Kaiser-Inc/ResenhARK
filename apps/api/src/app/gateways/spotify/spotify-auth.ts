export interface SpotifyTokenStore {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string | null): Promise<void>;
}

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const TIMEOUT_MS = 10_000;
const SCOPE = "playlist-read-private playlist-read-collaborative";

export class SpotifyAuth {
  private inflight: Promise<string | null> | null = null;
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly deps: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      store: SpotifyTokenStore;
      fetchFn?: typeof fetch;
      now: () => number;
    },
  ) {}

  authorizeUrl(state: string): string {
    const q = new URLSearchParams({
      response_type: "code",
      client_id: this.deps.clientId,
      scope: SCOPE,
      redirect_uri: this.deps.redirectUri,
      state,
    });
    return `https://accounts.spotify.com/authorize?${q}`;
  }

  async exchangeCode(code: string): Promise<void> {
    const res = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.deps.redirectUri,
    });
    const body = (await res.json().catch(() => ({}))) as TokenBody;
    if (!res.ok || !body.refresh_token || !body.access_token) {
      throw new Error(`spotify code exchange failed (${res.status})`);
    }
    await this.deps.store.setRefreshToken(body.refresh_token);
    this.cache(body);
  }

  async accessToken(): Promise<string | null> {
    if (this.cached && this.deps.now() < this.cached.expiresAt) return this.cached.token;
    this.inflight ??= this.refresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refresh(): Promise<string | null> {
    const refresh = await this.deps.store.getRefreshToken();
    if (!refresh) return null;
    const res = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
    const body = (await res.json().catch(() => ({}))) as TokenBody;
    if (res.status === 400 && body.error === "invalid_grant") {
      this.cached = null;
      await this.deps.store.setRefreshToken(null);
      return null;
    }
    if (!res.ok || !body.access_token) throw new Error(`spotify refresh failed (${res.status})`);
    if (body.refresh_token) await this.deps.store.setRefreshToken(body.refresh_token);
    this.cache(body);
    return body.access_token;
  }

  /** Drops the cached access token so the next call refreshes (used after a 401). */
  invalidate(): void {
    this.cached = null;
  }

  async disconnect(): Promise<void> {
    this.cached = null;
    await this.deps.store.setRefreshToken(null);
  }

  async isConnected(): Promise<boolean> {
    return (await this.deps.store.getRefreshToken()) !== null;
  }

  private cache(body: TokenBody): void {
    this.cached = {
      token: body.access_token as string,
      expiresAt: this.deps.now() + ((body.expires_in ?? 3600) - 60) * 1000,
    };
  }

  private tokenRequest(params: Record<string, string>): Promise<Response> {
    const basic = Buffer.from(`${this.deps.clientId}:${this.deps.clientSecret}`).toString("base64");
    return (this.deps.fetchFn ?? fetch)(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}

type TokenBody = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};
