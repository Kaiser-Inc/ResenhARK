import type { JoinRoomInput } from "@resenhark/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3333";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError("network", 0);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new ApiError(
      typeof payload?.error === "string" ? payload.error : "unknown",
      response.status,
    );
  }
  return (await response.json()) as T;
}

export function createRoom(
  input: JoinRoomInput,
): Promise<{ code: string; memberId: string; sessionToken: string }> {
  return postJson("/rooms", input);
}

export function joinRoom(
  code: string,
  input: JoinRoomInput,
): Promise<{ memberId: string; sessionToken: string }> {
  return postJson(`/rooms/${encodeURIComponent(code)}/members`, input);
}

export async function roomExists(code: string): Promise<boolean> {
  const response = await request(`/rooms/${encodeURIComponent(code)}`);
  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new ApiError("unknown", response.status);
}
