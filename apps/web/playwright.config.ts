import path from "node:path";
import { defineConfig } from "@playwright/test";

const repoRoot = path.resolve(__dirname, "../..");
const WEB_URL = process.env.E2E_BASE_URL ?? "http://localhost:4001";

export default defineConfig({
  testDir: "./e2e",
  outputDir: path.resolve(
    __dirname,
    "../../.dev-flow/2026-10-04-rodada-1-sala-chat-hitline/ui/test-results",
  ),
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: WEB_URL, browserName: "chromium" },
  reporter: "list",
  webServer: [
    {
      command: "PATH=$HOME/.local/bin:$PATH pnpm --filter api dev",
      cwd: repoRoot,
      port: 3334,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        PORT: "3334",
        REDIS_URL: "redis://localhost:6379/14",
        PLAYLIST_SOURCE: "fixture",
        AUDIO_SOURCE: "fixture",
        // Pinned so a developer's apps/api/.env (real env beats dotenv) cannot change e2e behaviour.
        ADMIN_PASSWORD: "dev",
        SPOTIFY_CLIENT_ID: "",
        SPOTIFY_CLIENT_SECRET: "",
        SPOTIFY_REDIRECT_URI: "",
        WEB_URL: "http://localhost:4001",
        PUBLIC_API_URL: "http://127.0.0.1:3334",
        TRUST_PROXY_HOPS: "0",
        CORS_ORIGIN: "http://localhost:4001",
        E2E_SEED: "1",
      },
    },
    {
      command: "PATH=$HOME/.local/bin:$PATH pnpm --filter web exec sh -c 'next build --webpack && next start -p 4001'",
      cwd: repoRoot,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      // Build+start (not dev): next dev locks .next/dev per project, so it cannot run beside the developer's own dev server.
      timeout: 300_000,
      // Real env beats .env.local: e2e talks to the API directly, never through a dev proxy/tunnel setup.
      env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:3334", API_PROXY_URL: "" },
    },
  ],
});
