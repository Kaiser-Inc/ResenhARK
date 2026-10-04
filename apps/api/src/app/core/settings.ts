import "dotenv/config";
import { z } from "zod";

const nodeEnv = z.enum(["development", "test", "production"]).default("development");

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3333),
    NODE_ENV: nodeEnv,
    CORS_ORIGIN: z.string().default("http://localhost:4000"),
    REDIS_URL: z.string().default("redis://localhost:6379/0"),
    // Dev-only default; production must set its own value.
    SESSION_SECRET: z.string().min(32).default("dev-only-session-secret-change-me-in-prod"),
    ADMIN_PASSWORD: z.string().default("dev"),
    PUBLIC_API_URL: z.string().default("http://127.0.0.1:3333"),
    SPOTIFY_CLIENT_ID: z.string().optional(),
    SPOTIFY_CLIENT_SECRET: z.string().optional(),
    SPOTIFY_REDIRECT_URI: z.string().optional(),
    WEB_URL: z.string().default("http://localhost:4000"),
    PLAYLIST_SOURCE: z.enum(["spotify", "fixture"]).optional(),
    AUDIO_SOURCE: z.enum(["real", "fixture"]).default("real"),
  })
  .transform((env) => ({
    ...env,
    PLAYLIST_SOURCE: env.PLAYLIST_SOURCE ?? (env.NODE_ENV === "production" ? "spotify" : "fixture"),
  }));

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const settings = parsed.data;
