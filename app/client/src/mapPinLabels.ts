export type MapLabelRect = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

export type MapPinLabelCandidate = Readonly<{
  id: string;
  rect: MapLabelRect;
  /** Higher-priority labels win when two labels compete for the same space. */
  priority?: number;
}>;

function expandRect(rect: MapLabelRect, amount: number): MapLabelRect {
  return {
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount,
    left: rect.left - amount,
  };
}

function intersects(a: MapLabelRect, b: MapLabelRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function containedBy(inner: MapLabelRect, outer: MapLabelRect, inset: number): boolean {
  return inner.left >= outer.left + inset
    && inner.right <= outer.right - inset
    && inner.top >= outer.top + inset
    && inner.bottom <= outer.bottom - inset;
}

/**
 * Returns the subset of visible event-title labels that can be painted without
 * colliding with another displayed label, a pin, map controls, or the edge of
 * the visible map. A crowded area only hides the labels involved; clear labels
 * elsewhere in the visible map continue to render.
 */
export function visibleMapPinLabelIds(
  candidates: readonly MapPinLabelCandidate[],
  mapRect: MapLabelRect,
  obstacles: readonly MapLabelRect[],
  gap = 4,
): Set<string> {
  // Higher-priority markers claim space first. The ID tie-break keeps the
  // result stable when otherwise equivalent labels overlap.
  const ordered = [...candidates].sort((a, b) => (
    (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id)
  ));
  const accepted: MapLabelRect[] = [];
  const visible = new Set<string>();

  for (const candidate of ordered) {
    if (!containedBy(candidate.rect, mapRect, gap)) continue;
    // Pad each label once when testing it. Obstacles already describe their
    // occupied pixels; expanding both sides would double the requested gap.
    const padded = expandRect(candidate.rect, gap);
    if (obstacles.some((rect) => intersects(padded, rect))) continue;
    if (accepted.some((rect) => intersects(padded, rect))) continue;
    accepted.push(candidate.rect);
    visible.add(candidate.id);
  }

  return visible;
}
