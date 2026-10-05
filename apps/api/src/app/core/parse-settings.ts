import { z } from "zod";

const DEV_SESSION_SECRET = "dev-only-session-secret-change-me-in-prod";

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3333),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    CORS_ORIGIN: z.string().default("http://localhost:4000"),
    REDIS_URL: z.string().default("redis://localhost:6379/0"),
    SESSION_SECRET: z.string().min(32).optional(),
    ADMIN_PASSWORD: z.string().optional(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    PUBLIC_API_URL: z.string().default("http://127.0.0.1:3333"),
    SPOTIFY_CLIENT_ID: z.string().optional(),
    SPOTIFY_CLIENT_SECRET: z.string().optional(),
    SPOTIFY_REDIRECT_URI: z.string().optional(),
    WEB_URL: z.string().default("http://localhost:4000"),
    PLAYLIST_SOURCE: z.enum(["spotify", "fixture"]).optional(),
    AUDIO_SOURCE: z.enum(["real", "fixture"]).default("real"),
    E2E_SEED: z.coerce.number().int().optional(),
  })
  .transform((env, ctx) => {
    const production = env.NODE_ENV === "production";
    if (production && !env.SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET (min 32 chars) is required in production",
      });
      return z.NEVER;
    }
    if (production && (env.ADMIN_PASSWORD ?? "").length < 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_PASSWORD"],
        message: "ADMIN_PASSWORD (min 12 chars) is required in production",
      });
      return z.NEVER;
    }
    const playlistSource = env.PLAYLIST_SOURCE ?? (production ? "spotify" : "fixture");
    if (playlistSource === "spotify") {
      for (const key of [
        "SPOTIFY_CLIENT_ID",
        "SPOTIFY_CLIENT_SECRET",
        "SPOTIFY_REDIRECT_URI",
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when PLAYLIST_SOURCE=spotify`,
          });
          return z.NEVER;
        }
      }
    }
    return {
      ...env,
      ADMIN_PASSWORD: env.ADMIN_PASSWORD ?? "dev",
      SESSION_SECRET: env.SESSION_SECRET ?? DEV_SESSION_SECRET,
      // Seeds the rng (turn order, deck shuffle) for e2e; ignored outside NODE_ENV=test.
      E2E_SEED: env.NODE_ENV === "test" ? env.E2E_SEED : undefined,
      PLAYLIST_SOURCE: playlistSource,
    };
  });

export const parseSettings = (env: NodeJS.ProcessEnv) => envSchema.safeParse(env);
