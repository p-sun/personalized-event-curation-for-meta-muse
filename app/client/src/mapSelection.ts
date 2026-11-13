export type SelectAndFrameEventInput = Readonly<{
  eventId: string;
  occurrenceId: string;
  onSelectOccurrence: (occurrenceId: string) => void;
  onFrameEvent: (eventId: string) => void;
}>;

/**
 * A frame-location action owns both effects. Passing the event id directly to
 * the map avoids waiting for React selection state to propagate before the
 * camera can frame an unselected card.
 */
export function selectAndFrameEvent({
  eventId,
  occurrenceId,
  onSelectOccurrence,
  onFrameEvent,
}: SelectAndFrameEventInput): void {
  onSelectOccurrence(occurrenceId);
  onFrameEvent(eventId);
}

export type RowMapHighlightInput = Readonly<{
  /** The event whose Option B row owns the minimap. */
  attachedEventId: string;
  /** The app-wide selected event shared by Options A, B, and C. */
  sharedSelectedEventId: string | null;
  fullscreen: boolean;
}>;

/**
 * Every map receives exactly one highlighted event id. Option B is the only
 * place that chooses between two sources:
 * - an inline minimap highlights the event attached to its row;
 * - its fullscreen map follows the app-wide selection used by the tray.
 *
 * The EventMap then uses this one value for both marker appearance and camera
 * framing, so a green framed pin cannot drift away from the intended event.
 */
export function rowMapHighlightedEventId({
  attachedEventId,
  sharedSelectedEventId,
  fullscreen,
}: RowMapHighlightInput): string {
  if (!fullscreen) return attachedEventId;
  return sharedSelectedEventId ?? attachedEventId;
}

export type HighlightTitleGroup = Readonly<{
  key: string;
  lat: number;
  lng: number;
  items: readonly Readonly<{
    event: Readonly<{ id: string; venue: string }>;
  }>[];
}>;

export type HighlightTitleBubble = Readonly<{
  /** Pin group the bubble is anchored to: the group holding the highlighted event. */
  groupKey: string;
  lat: number;
  lng: number;
  /** Bubble text: the highlighted event's venue. */
  content: string;
}>;

/**
 * The map's one title bubble, derived — never stored per pin.
 *
 * `highlightedEventId` is the map's single source of truth for selection: by
 * construction exactly one event is highlighted at a time (the same state
 * that paints the green location highlight). This function is the ONLY way a
 * title bubble comes to exist, and its content and anchor are a pure
 * function of that highlight state, so the bubble cannot display any event
 * other than the highlighted one and there can never be more than one.
 *
 * `bubbleRequested` is visibility only, never identity: it records that a
 * pin tap asked for a bubble. Selection alone never conjures one — with no
 * prior pin tap, every selection change (tap or scroll) leaves the map
 * bubble-free. Once requested, the bubble's identity still comes solely
 * from the highlight: a highlight that no longer resolves to a pin (cleared
 * or filtered out) yields no bubble instead of a stale one.
 *
 * A group is keyed by coordinates, so several events can share one pin;
 * mirroring the marker's primary-item rule, the highlighted event inside
 * the group supplies the label — never whichever event created the marker.
 */
export function titleBubbleForHighlight(
  groups: readonly HighlightTitleGroup[],
  highlightedEventId: string | null,
  bubbleRequested: boolean,
): HighlightTitleBubble | null {
  if (!bubbleRequested || !highlightedEventId) return null;
  const group = groups.find((candidate) => (
    candidate.items.some(({ event }) => event.id === highlightedEventId)
  ));
  if (!group) return null;
  const highlighted = group.items.find(({ event }) => event.id === highlightedEventId);
  if (!highlighted) return null;
  return {
    groupKey: group.key,
    lat: group.lat,
    lng: group.lng,
    content: highlighted.event.venue,
  };
}
