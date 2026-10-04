import path from "node:path";
import { defineConfig } from "@playwright/test";

const repoRoot = path.resolve(__dirname, "../..");
const WEB_URL = process.env.E2E_BASE_URL ?? "http://localhost:4000";

export default defineConfig({
  testDir: "./e2e",
  outputDir: path.resolve(
    __dirname,
    "../../.dev-flow/2026-10-04-rodada-1-sala-chat-hitline/ui/test-results",
  ),
  timeout: 30_000,
  workers: 1,
  use: { baseURL: WEB_URL, browserName: "chromium" },
  reporter: "list",
  webServer: [
    {
      command: "PATH=$HOME/.local/bin:$PATH pnpm --filter api dev",
      cwd: repoRoot,
      port: 3333,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        PORT: "3333",
        REDIS_URL: "redis://localhost:6379/14",
        PLAYLIST_SOURCE: "fixture",
        AUDIO_SOURCE: "fixture",
        CORS_ORIGIN: "http://localhost:4000",
        E2E_SEED: "1",
      },
    },
    {
      command: "PATH=$HOME/.local/bin:$PATH pnpm --filter web dev",
      cwd: repoRoot,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
