export const FILTER_FULL_ALIGN_THRESHOLD = 0.25;

/**
 * Return the first ancestor that owns a layout box. Some filter-control
 * wrappers use `display: contents`, so their clientWidth is zero even though
 * the row is laid out against a wider flex container.
 */
export function nearestMeasurableContainerInnerWidth(row: HTMLElement): number {
  let container = row.parentElement;
  while (container) {
    if (Number.isFinite(container.clientWidth) && container.clientWidth > 0) return container.clientWidth;
    container = container.parentElement;
  }
  return 0;
}

/**
 * A filter row only spreads its controls across the full width when they fit
 * on one line and the remaining space is small. This keeps sparse rows
 * naturally left-aligned while avoiding a narrow, accidental-looking gutter.
 */
export function shouldFullyAlignFilterRow(
  containerInnerWidth: number,
  controlWidths: readonly number[],
  gapWidth: number,
  threshold = FILTER_FULL_ALIGN_THRESHOLD,
): boolean {
  if (!Number.isFinite(containerInnerWidth) || containerInnerWidth <= 0 || controlWidths.length === 0) return false;

  const safeGap = Number.isFinite(gapWidth) ? Math.max(0, gapWidth) : 0;
  const contentWidth = controlWidths.reduce(
    (total, width) => total + (Number.isFinite(width) ? Math.max(0, width) : 0),
    0,
  ) + safeGap * Math.max(0, controlWidths.length - 1);
  const remainingWidth = containerInnerWidth - contentWidth;

  return remainingWidth >= 0 && remainingWidth <= containerInnerWidth * threshold;
}
