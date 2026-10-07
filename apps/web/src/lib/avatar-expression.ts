type EntryState = { failed: boolean; changed: boolean; typing: boolean; validName: boolean };

export function avatarExpression({ failed, changed, typing, validName }: EntryState) {
  if (failed) return "sad";
  if (changed) return "love";
  if (typing) return "thinking";
  return validName ? "happy" : "idle";
}
