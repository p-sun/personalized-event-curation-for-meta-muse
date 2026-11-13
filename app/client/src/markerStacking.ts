import { MARKER_PIN_GEOMETRY } from "./markerPins";

export type EventMarkerTier = "normal" | "favorite" | "selected";

export type MarkerStackingState = Readonly<{
  tier: EventMarkerTier;
  deterministicRank: number;
  deterministicRankCount: number;
}>;

// Leaflet computes a marker's final z-index as screenY + zIndexOffset. Two
// event-marker visuals can only fight for the same pixels while their anchor
// points are within this vertical distance:
//
// - 31px: ceil(30.36px), the shared marker canvas height
// - 26px: the largest 4px drop-shadow's practical 3-sigma footprint on both
//         sides, plus its 2px vertical offset
//
// Titles do not increase the bound: the label collision pass hides any title
// that intersects a pin or another visible title. Seven extra pixels cover
// Leaflet's integer projection and browser rasterization. Therefore adjacent
// semantic stack positions are 64px apart: larger than any screen-Y delta for
// event-marker visuals that can overlap, without an arbitrary 10,000 band.
export const MAX_OVERLAPPING_MARKER_SCREEN_Y_DELTA_PX = (
  Math.ceil(MARKER_PIN_GEOMETRY.height) + 26
);
export const Z_INDEX_STRIDE = MAX_OVERLAPPING_MARKER_SCREEN_Y_DELTA_PX + 7;

const TIER_ORDER: Readonly<Record<EventMarkerTier, number>> = Object.freeze({
  normal: 0,
  favorite: 1,
  selected: 2,
});

// Event pins share Leaflet's marker pane and are ordered inside it with
// zIndexOffset. The user's location lives in its own higher pane so no event
// count, screen-Y value, or selection state can ever paint above it.
export const USER_LOCATION_PANE = "user-location-pane";
export const USER_LOCATION_PANE_Z_INDEX = 1_000;

/**
 * Translates semantic marker state into a Leaflet zIndexOffset.
 *
 * The resulting order is lexicographic: tier first, then lower deterministic
 * rank. Multiplying each adjacent position by Z_INDEX_STRIDE makes that order
 * dominate Leaflet's screen-Y term whenever two event-marker visuals overlap.
 */
export function markerZIndexOffset({
  tier,
  deterministicRank,
  deterministicRankCount,
}: MarkerStackingState): number {
  const safeRankCount = Math.max(1, deterministicRankCount);
  const safeRank = Math.min(safeRankCount, Math.max(1, deterministicRank));
  const tierStride = safeRankCount + 1;
  const rankWithinTier = safeRankCount - safeRank;
  const semanticStackPosition = TIER_ORDER[tier] * tierStride + rankWithinTier;
  return semanticStackPosition * Z_INDEX_STRIDE;
}
