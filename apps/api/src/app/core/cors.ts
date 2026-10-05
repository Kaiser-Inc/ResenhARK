import type { FastifyCorsOptions } from "@fastify/cors";
import { settings } from "./settings.js";

export const corsOptions: FastifyCorsOptions = {
  origin: settings.CORS_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
