import { z } from "zod";

const DEV_SESSION_SECRET = "dev-only-session-secret-change-me-in-prod";

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3333),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    CORS_ORIGIN: z.string().default("http://localhost:4000"),
    REDIS_URL: z.string().default("redis://localhost:6379/0"),
    SESSION_SECRET: z.string().min(32).optional(),
    ADMIN_PASSWORD: z.string().default("dev"),
    PUBLIC_API_URL: z.string().default("http://127.0.0.1:3333"),
    SPOTIFY_CLIENT_ID: z.string().optional(),
    SPOTIFY_CLIENT_SECRET: z.string().optional(),
    SPOTIFY_REDIRECT_URI: z.string().optional(),
    WEB_URL: z.string().default("http://localhost:4000"),
    PLAYLIST_SOURCE: z.enum(["spotify", "fixture"]).optional(),
    AUDIO_SOURCE: z.enum(["real", "fixture"]).default("real"),
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
    return {
      ...env,
      SESSION_SECRET: env.SESSION_SECRET ?? DEV_SESSION_SECRET,
      PLAYLIST_SOURCE: env.PLAYLIST_SOURCE ?? (production ? "spotify" : "fixture"),
    };
  });

export const parseSettings = (env: NodeJS.ProcessEnv) => envSchema.safeParse(env);
