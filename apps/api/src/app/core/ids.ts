import { randomBytes } from "node:crypto";

export const newId = (): string => randomBytes(16).toString("base64url");
export const newSessionToken = newId;
