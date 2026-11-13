import { describe, expect, test } from "bun:test";
import {
markerZIndexOffset,
MAX_OVERLAPPING_MARKER_SCREEN_Y_DELTA_PX,
USER_LOCATION_PANE,
USER_LOCATION_PANE_Z_INDEX,
Z_INDEX_STRIDE,
type EventMarkerTier,
} from "./markerStacking";

const DETERMINISTIC_RANK_COUNT = 150;
const offset = (deterministicRank: number, tier: EventMarkerTier = "normal") => markerZIndexOffset({
  deterministicRank,
  deterministicRankCount: DETERMINISTIC_RANK_COUNT,
  tier,
});

// This is Leaflet's effective comparison: projected screen Y plus our offset.
const effectiveZIndex = (screenY: number, deterministicRank: number, tier: EventMarkerTier = "normal") => (
  screenY + offset(deterministicRank, tier)
);

describe("markerZIndexOffset", () => {
  test("uses a geometry-derived stride larger than the maximum overlapping screen-Y delta", () => {
    expect(MAX_OVERLAPPING_MARKER_SCREEN_Y_DELTA_PX).toBe(57);
    expect(Z_INDEX_STRIDE).toBe(64);
    expect(Z_INDEX_STRIDE).toBeGreaterThan(MAX_OVERLAPPING_MARKER_SCREEN_Y_DELTA_PX);
  });

  test("keeps lower deterministic ranks above higher ranks despite Leaflet screen-Y ordering", () => {
    const lowerRankAtTop = effectiveZIndex(0, 17, "favorite");
    const higherRankAtBottom = effectiveZIndex(
      MAX_OVERLAPPING_MARKER_SCREEN_Y_DELTA_PX,
      18,
      "favorite",
    );
    expect(lowerRankAtTop).toBeGreaterThan(higherRankAtBottom);
  });

  test("layers selected above favorites above normal pins for every overlapping position", () => {
    const bottomOfOverlap = MAX_OVERLAPPING_MARKER_SCREEN_Y_DELTA_PX;
    expect(effectiveZIndex(0, 150, "selected")).toBeGreaterThan(
      effectiveZIndex(bottomOfOverlap, 1, "favorite"),
    );
    expect(effectiveZIndex(0, 150, "favorite")).toBeGreaterThan(
      effectiveZIndex(bottomOfOverlap, 1, "normal"),
    );
  });

  test("uses deterministic ranks inside every tier, including ranks above 99", () => {
    expect(offset(1)).toBeGreaterThan(offset(2));
    expect(offset(100)).toBeGreaterThan(offset(101));
    expect(offset(1, "favorite")).toBeGreaterThan(offset(101, "favorite"));
    expect(offset(1, "selected")).toBeGreaterThan(offset(101, "selected"));
  });

  test("reserves a higher Leaflet pane for the user's location", () => {
    expect(USER_LOCATION_PANE).toBe("user-location-pane");
    // Leaflet's default marker pane is 600. Event z-index offsets only order
    // siblings inside that pane, so this separate pane always wins.
    expect(USER_LOCATION_PANE_Z_INDEX).toBeGreaterThan(600);
  });
});
