import { createHmac, timingSafeEqual } from "node:crypto";

export function audioTicket(secret: string, drawId: string, memberId: string): string {
  return createHmac("sha256", secret).update(`${drawId}\n${memberId}`).digest("base64url");
}

export function verifyAudioTicket(
  secret: string,
  drawId: string,
  memberId: string,
  ticket: string,
): boolean {
  const expected = Buffer.from(audioTicket(secret, drawId, memberId));
  const given = Buffer.from(ticket);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function audioPath(secret: string, drawId: string, memberId: string): string {
  return `/audio/${drawId}?m=${memberId}&t=${audioTicket(secret, drawId, memberId)}`;
}
