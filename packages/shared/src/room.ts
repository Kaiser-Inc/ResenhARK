import { z } from "zod";

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const roomCodeSchema = z
  .string()
  .transform((code) => code.toUpperCase())
  .pipe(z.string().regex(/^[A-HJKMNP-Z]{5}$/));

export const SHAPES = ["round", "boxy", "organic", "cloud", "sun", "nub", "capsule", "triangle", "hexagon", "droplet"] as const;
export type Shape = (typeof SHAPES)[number];
// Eight evenly spread stops; blobatar accepts any degree, these are the picker's options.
export const HUES = [12, 45, 85, 150, 195, 235, 275, 320] as const;

export const avatarSchema = z.object({ hue: z.number().int().min(0).max(359), shape: z.enum(SHAPES) });
export type Avatar = z.infer<typeof avatarSchema>;

export const joinRoomInputSchema = z.object({ name: z.string().trim().min(1).max(20), avatar: avatarSchema });
export type JoinRoomInput = z.infer<typeof joinRoomInputSchema>;

export function normalizeName(name: string): string {
  return name.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
