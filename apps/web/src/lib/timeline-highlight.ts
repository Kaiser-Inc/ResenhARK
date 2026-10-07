export function timelineHighlightFor(
  reveal: { receiverId: string | null; card: { id: string } } | null | undefined,
  playerId: string,
  activeCardId: string | null,
): string | null {
  return reveal?.receiverId === playerId && reveal.card.id === activeCardId ? activeCardId : null;
}
