export const MARKER_PIN_VIEWBOX = Object.freeze({
  width: 40,
  height: 44,
});

// Both marker variants share one footprint that is 20% larger than the prior
// 23 × 25.3 marker. The unchanged viewBox scales the number with the shape, so
// its relative padding stays consistent without a second sizing path.
export const MARKER_PIN_GEOMETRY = Object.freeze({
  width: 27.6,
  height: 30.36,
  anchorX: 13.8,
  anchorY: 30.36,
  outlineWidth: 2,
});

type MarkerPinVariant = Readonly<{
  baseColor: string;
  iconPath: string;
  textYPercent: number;
}>;

/**
 * Shape-specific marker data. Geometry, outline, shadow, selected color, and
 * label styling intentionally live outside this table so both pin variants
 * cannot drift apart.
 */
export const MARKER_PIN_VARIANTS = Object.freeze({
  standard: Object.freeze({
    baseColor: "var(--map-pin)",
    iconPath: "M20 42L7.4 29.4C3.9 26.1 2 21.6 2 16.8C2 8.6 9.3 2 20 2C30.7 2 38 8.6 38 16.8C38 21.6 36.1 26.1 32.6 29.4Z",
    textYPercent: 38,
  }),
  favorite: Object.freeze({
    baseColor: "var(--favorite-pin)",
    // Keep the same 34px width and bottom point while pulling the lobes down
    // 3px. The heart is shorter without changing the shared canvas or anchor.
    iconPath: "M20 42C17 38 3 29 3 17C3 10 8 5 14 5C17.5 5 20 8 20 11.5C20 8 22.5 5 26 5C32 5 37 10 37 17C37 29 23 38 20 42Z",
    textYPercent: 50,
  }),
} satisfies Record<"standard" | "favorite", MarkerPinVariant>);

export function markerPinVariant(isFavorite: boolean): MarkerPinVariant {
  return isFavorite ? MARKER_PIN_VARIANTS.favorite : MARKER_PIN_VARIANTS.standard;
}
