export type TrayPosition = "middle" | "full";

export const TRAY_FLING_THRESHOLD_PX_PER_MS = 0.35;
export const TRAY_PROJECTION_MS = 180;

// WebKit can report negative rubber-band overscroll and sub-pixel positive
// values at the visual top edge. A downward pull may resize the tray from any
// of those values; upward movement remains a native overflow scroll.
export const SCROLL_BOUNDARY_EPSILON_PX = 0.5;

export function isScrollAtTop(scrollTop: number): boolean {
  return scrollTop <= SCROLL_BOUNDARY_EPSILON_PX;
}

export function shouldBeginTopEdgeTrayDrag(
  scrollTop: number,
  pullPastTop: number,
  activationDistance = 4,
): boolean {
  return isScrollAtTop(scrollTop) && pullPastTop > activationDistance;
}

export type TrayGestureMode = "undecided" | "scroll" | "sheet";

/**
 * Resolves gesture ownership once, after a small direction threshold. Once
 * native scrolling wins, reaching the top later in that same gesture cannot
 * hand ownership to the sheet.
 */
export function resolveTrayGestureMode(
  currentMode: TrayGestureMode,
  scrollTopAtDecision: number,
  totalFingerDeltaY: number,
  activationDistance = 8,
): TrayGestureMode {
  if (currentMode !== "undecided") return currentMode;
  if (Math.abs(totalFingerDeltaY) < activationDistance) return "undecided";
  return isScrollAtTop(scrollTopAtDecision) && totalFingerDeltaY > 0
    ? "sheet"
    : "scroll";
}

export type TraySnapDefinition = Readonly<{
  id: TrayPosition;
  /** A viewport-height fraction, e.g. 0.4 for 40%. Every detent shows content. */
  viewportFraction: number;
}>;

export type TraySnapPoint = Readonly<{
  id: TrayPosition;
  height: number;
}>;

export type TraySnapPoints = readonly TraySnapPoint[];

export const DEFAULT_TRAY_POSITIONS: readonly TraySnapDefinition[] = Object.freeze([
  { id: "middle", viewportFraction: 0.4 },
  { id: "full", viewportFraction: 0.95 },
]);

export function trayIsMovable(positions: readonly TraySnapDefinition[]): boolean {
  return positions.length > 1;
}

/**
 * A mobile software keyboard shrinks visualViewport while its text field has
 * focus. That temporary viewport must not redefine tray detents or the tray
 * drops away from the results the user is filtering. A growing viewport (the
 * keyboard closing) is safe to adopt immediately.
 */
export function shouldAdoptTrayViewportHeight(
  currentHeight: number,
  nextHeight: number,
  textEntryHasFocus: boolean,
): boolean {
  return !textEntryHasFocus || nextHeight >= currentHeight;
}

export function traySnapPoints(
  viewportHeight: number,
  positions: readonly TraySnapDefinition[] = DEFAULT_TRAY_POSITIONS,
): TraySnapPoints {
  const height = Math.max(viewportHeight, 0);
  return positions.map((position) => ({
    id: position.id,
    height: height * position.viewportFraction,
  }));
}

export function traySnapHeight(snaps: TraySnapPoints, position: TrayPosition): number {
  const snap = snaps.find((candidate) => candidate.id === position);
  if (!snap) throw new Error(`Tray position ${position} is not configured`);
  return snap.height;
}

export function clampTrayHeight(height: number, snaps: TraySnapPoints): number {
  const minimum = Math.min(...snaps.map((snap) => snap.height));
  const maximum = Math.max(...snaps.map((snap) => snap.height));
  return Math.min(maximum, Math.max(minimum, height));
}

/**
 * Raises a bottom-pinned tray until its top reaches a viewport-space boundary.
 * Focus must never make an already-taller tray shorter, and configured detents
 * remain the hard outer bounds for the temporary presentation height.
 */
export function trayHeightBelowViewportBoundary(
  viewportHeight: number,
  boundaryY: number,
  currentHeight: number,
  snaps: TraySnapPoints,
): number {
  const boundaryHeight = viewportHeight - boundaryY;
  return Math.max(currentHeight, clampTrayHeight(boundaryHeight, snaps));
}

/**
 * Maps a pointer drag directly to tray height. Detents only clamp the outer
 * range while the pointer is down; choosing a detent is exclusively a release
 * concern. This prevents content-to-tray handoff from snapping early.
 */
export function draggedTrayHeight(
  startHeight: number,
  startPointerY: number,
  pointerY: number,
  snaps: TraySnapPoints,
): number {
  return clampTrayHeight(startHeight + startPointerY - pointerY, snaps);
}

/**
 * Immutable geometry for a drag that the tray has claimed. Keeping the
 * pointer-down anchor for the lifetime of the touch makes distance independent
 * of event frequency: a slow and a fast 200px pull produce the same height.
 */
export type OwnedTrayDrag = Readonly<{
  startHeight: number;
  startPointerY: number;
  currentHeight: number;
}>;

export function beginOwnedTrayDrag(startHeight: number, startPointerY: number): OwnedTrayDrag {
  return { startHeight, startPointerY, currentHeight: startHeight };
}

export function moveOwnedTrayDrag(
  drag: OwnedTrayDrag,
  pointerY: number,
  snaps: TraySnapPoints,
): OwnedTrayDrag {
  return {
    ...drag,
    currentHeight: draggedTrayHeight(drag.startHeight, drag.startPointerY, pointerY, snaps),
  };
}

/**
 * Complete geometry for a gesture that begins inside the tray's native
 * scroller. The immutable start anchor is retained even while direction is
 * undecided, so taking ownership after the slop threshold never truncates the
 * distance already travelled.
 */
export type TrayContentGesture = Readonly<{
  startHeight: number;
  startPointerY: number;
  lastPointerY: number;
  lastTimeMs: number;
  velocityPxPerMs: number;
  mode: TrayGestureMode;
  sheetDrag: OwnedTrayDrag | null;
}>;

export function beginTrayContentGesture(
  startHeight: number,
  startPointerY: number,
  startTimeMs: number,
): TrayContentGesture {
  return {
    startHeight,
    startPointerY,
    lastPointerY: startPointerY,
    lastTimeMs: startTimeMs,
    velocityPxPerMs: 0,
    mode: "undecided",
    sheetDrag: null,
  };
}

export function advanceTrayContentGesture(
  gesture: TrayContentGesture,
  pointerY: number,
  timeMs: number,
  scrollTop: number,
  snaps: TraySnapPoints,
  activationDistance = 8,
): TrayContentGesture {
  const totalFingerDelta = pointerY - gesture.startPointerY;
  const mode = resolveTrayGestureMode(
    gesture.mode,
    scrollTop,
    totalFingerDelta,
    activationDistance,
  );
  const elapsed = Math.max(timeMs - gesture.lastTimeMs, 1);
  const instantaneousVelocity = (gesture.lastPointerY - pointerY) / elapsed;
  const velocityPxPerMs = gesture.velocityPxPerMs * 0.65 + instantaneousVelocity * 0.35;

  if (mode !== "sheet") {
    return {
      ...gesture,
      mode,
      lastPointerY: pointerY,
      lastTimeMs: timeMs,
      velocityPxPerMs,
    };
  }

  const owned = gesture.sheetDrag
    ?? beginOwnedTrayDrag(gesture.startHeight, gesture.startPointerY);
  return {
    ...gesture,
    mode,
    lastPointerY: pointerY,
    lastTimeMs: timeMs,
    velocityPxPerMs,
    sheetDrag: moveOwnedTrayDrag(owned, pointerY, snaps),
  };
}

export type ReleasedTrayContentGesture = Readonly<{
  heightAtRelease: number;
  position: TrayPosition;
  velocityPxPerMs: number;
}>;

/**
 * Releases from the gesture's owned geometry, never a rendered height or a
 * last-move cache. This is what makes a full pull deterministically settle at
 * 40% instead of snapping back to 95% after a truncated event stream.
 */
export function releaseTrayContentGesture(
  gesture: TrayContentGesture,
  snaps: TraySnapPoints,
): ReleasedTrayContentGesture | null {
  if (gesture.mode !== "sheet" || !gesture.sheetDrag) return null;
  const heightAtRelease = gesture.sheetDrag.currentHeight;
  return {
    heightAtRelease,
    position: releaseTrayPosition(heightAtRelease, gesture.velocityPxPerMs, snaps),
    velocityPxPerMs: gesture.velocityPxPerMs,
  };
}

export function nearestTrayPosition(height: number, snaps: TraySnapPoints): TrayPosition {
  const first = snaps[0];
  if (!first) throw new Error("A tray requires at least one snap position");
  return snaps.reduce((nearest, candidate) => (
    Math.abs(candidate.height - height) < Math.abs(nearest.height - height) ? candidate : nearest
  ), first).id;
}

/**
 * Resolves a drag release to one of the configured tray detents. A decisive
 * fling advances one detent in its direction; a slow release projects the
 * current motion briefly before choosing the closest detent.
 */
export function releaseTrayPosition(
  height: number,
  velocityPxPerMs: number,
  snaps: TraySnapPoints,
): TrayPosition {
  if (Math.abs(velocityPxPerMs) >= TRAY_FLING_THRESHOLD_PX_PER_MS) {
    const current = nearestTrayPosition(height, snaps);
    return adjacentTrayPosition(current, velocityPxPerMs > 0 ? "up" : "down", snaps);
  }

  const projectedHeight = clampTrayHeight(
    height + velocityPxPerMs * TRAY_PROJECTION_MS,
    snaps,
  );
  return nearestTrayPosition(projectedHeight, snaps);
}

export function adjacentTrayPosition(
  position: TrayPosition,
  direction: "up" | "down",
  snaps: TraySnapPoints,
): TrayPosition {
  const index = snaps.findIndex((snap) => snap.id === position);
  const safeIndex = index < 0 ? 0 : index;
  return snaps[Math.min(snaps.length - 1, Math.max(0, safeIndex + (direction === "up" ? 1 : -1)))]!.id;
}
