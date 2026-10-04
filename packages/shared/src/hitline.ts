import { z } from "zod";

export const hitlineConfigSchema = z.object({
  targetCards: z.number().int().min(2).max(30),
  contestSeconds: z.number().int().min(5).max(60),
  guessSeconds: z.number().int().min(30).max(300),
  maxPlayers: z.number().int().min(1).max(15),
});
export type HitlineConfig = z.infer<typeof hitlineConfigSchema>;
export const DEFAULT_HITLINE_CONFIG: HitlineConfig = {
  targetCards: 10,
  contestSeconds: 15,
  guessSeconds: 120,
  maxPlayers: 15,
};
