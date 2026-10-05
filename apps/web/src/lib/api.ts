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

async function adminRequest(path: string, token: string, method: "GET" | "POST") {
  const response = await request(path, { method, headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new ApiError(
      typeof payload?.error === "string" ? payload.error : "unknown",
      response.status,
    );
  }
  return response;
}

export async function adminLogin(password: string): Promise<string> {
  const { adminToken } = await postJson<{ adminToken: string }>("/admin/login", { password });
  return adminToken;
}

export async function adminStatus(
  token: string,
): Promise<{ connected: boolean; configured: boolean }> {
  return (await adminRequest("/admin/spotify/status", token, "GET")).json();
}

export async function adminAuthorize(token: string): Promise<string> {
  const { authorizeUrl } = (await (
    await adminRequest("/admin/spotify/authorize", token, "POST")
  ).json()) as { authorizeUrl: string };
  // Only ever follow the Spotify consent page, whatever the server (or a proxy) returns.
  const url = new URL(authorizeUrl);
  if (url.protocol !== "https:" || url.hostname !== "accounts.spotify.com") {
    throw new ApiError("invalid-authorize-url", 0);
  }
  return url.href;
}

export async function adminDisconnect(token: string): Promise<void> {
  await adminRequest("/admin/spotify/disconnect", token, "POST");
}
