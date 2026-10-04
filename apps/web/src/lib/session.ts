export type Session = { memberId: string; sessionToken: string; name?: string };

const key = (code: string) => `resenhark:session:${code.toUpperCase()}`;

export function saveSession(code: string, session: Session): void {
  try {
    localStorage.setItem(key(code), JSON.stringify(session));
  } catch {
    // Storage blocked or full: the person just has to join again after a reload.
  }
}

export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "memberId" in parsed &&
      "sessionToken" in parsed &&
      typeof parsed.memberId === "string" &&
      typeof parsed.sessionToken === "string"
    ) {
      const name = "name" in parsed && typeof parsed.name === "string" ? parsed.name : undefined;
      return { memberId: parsed.memberId, sessionToken: parsed.sessionToken, name };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSession(code: string): void {
  try {
    localStorage.removeItem(key(code));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
