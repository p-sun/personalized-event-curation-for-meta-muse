export type FrameRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export type VisibleMapFrame = {
  visibleHeight: number;
  bottomOcclusion: number;
  centerOffsetY: number;
  paddingTopLeft: readonly [number, number];
  paddingBottomRight: readonly [number, number];
};

export const MAP_FRAME_EDGE_PADDING = 38;

/**
 * Describes the actually visible part of a map when a bottom tray overlaps it.
 * The visible region always starts at the map's top edge and ends at either
 * the map's bottom edge or the tray's top edge, whichever comes first.
 */
export function visibleMapFrame(
  mapRect: FrameRect,
  bottomOccluderRect?: FrameRect | null,
  edgePadding = MAP_FRAME_EDGE_PADDING,
): VisibleMapFrame {
  const mapHeight = Math.max(1, mapRect.height || mapRect.bottom - mapRect.top);
  const overlapsHorizontally = bottomOccluderRect
    ? bottomOccluderRect.right > mapRect.left && bottomOccluderRect.left < mapRect.right
    : false;
  const overlapsVertically = bottomOccluderRect
    ? bottomOccluderRect.bottom > mapRect.top && bottomOccluderRect.top < mapRect.bottom
    : false;
  const visibleBottom = overlapsHorizontally && overlapsVertically && bottomOccluderRect
    ? Math.min(mapRect.bottom, Math.max(mapRect.top, bottomOccluderRect.top))
    : mapRect.bottom;
  const visibleHeight = Math.max(1, Math.min(mapHeight, visibleBottom - mapRect.top));
  const bottomOcclusion = Math.max(0, mapHeight - visibleHeight);

  return {
    visibleHeight,
    bottomOcclusion,
    // Moving the camera center down by half the covered height places the
    // framed point in the vertical center of the visible (uncovered) map.
    centerOffsetY: bottomOcclusion / 2,
    paddingTopLeft: [edgePadding, edgePadding],
    paddingBottomRight: [edgePadding, edgePadding + bottomOcclusion],
  };
}
