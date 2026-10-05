const WEB_URL = process.env.E2E_BASE_URL ?? "http://localhost:4000";
const API_URL = "http://localhost:3333";

async function warm(url: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      // Any HTTP answer means the route finished compiling.
      await fetch(url, { signal: AbortSignal.timeout(90_000) });
      return;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`warm-up failed for ${url}: ${String(error)}`);
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
}

/** Next dev compiles each route on first hit; do it before tests so navigation stays fast. */
export default async function globalSetup(): Promise<void> {
  await warm(`${API_URL}/health`);
  await warm(`${WEB_URL}/`);
  await warm(`${WEB_URL}/sala/ZZZZZ`);
}
