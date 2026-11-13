export type MapControlId = "fullscreen" | "locate" | "zoom";

export type MapControlsConfig = Readonly<{
  /** Controls omitted for this map. New controls remain enabled by default. */
  blocklist?: readonly MapControlId[];
}>;

export function mapControlIsBlocked(
  config: MapControlsConfig | undefined,
  control: MapControlId,
): boolean {
  return config?.blocklist?.includes(control) ?? false;
}

/**
 * Places the shared map-control stack immediately below an optional top
 * overlay (the fullscreen filters). The returned value is added to the map's
 * normal edge inset, so ordinary maps remain pinned to the top-left.
 */
export function mapControlsTopOffset(
  mapTop: number,
  overlayBottom: number | null,
  edgeInset = 12,
  gap = 8,
): number {
  if (overlayBottom === null) return 0;
  return Math.max(0, overlayBottom - mapTop + gap - edgeInset);
}
