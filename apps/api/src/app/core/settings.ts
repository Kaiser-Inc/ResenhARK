import "dotenv/config";
import { parseSettings } from "./parse-settings.js";

const parsed = parseSettings(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const settings = parsed.data;
