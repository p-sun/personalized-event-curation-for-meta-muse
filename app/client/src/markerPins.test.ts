import { describe, expect, test } from "bun:test";
import { MARKER_PIN_GEOMETRY, MARKER_PIN_VARIANTS, MARKER_PIN_VIEWBOX, markerPinVariant } from "./markerPins";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

describe("shared map-pin model", () => {
  test("both icons render 20% larger with their bottom point as the map anchor", () => {
    expect(MARKER_PIN_VIEWBOX).toEqual({ width: 40, height: 44 });
    expect(MARKER_PIN_GEOMETRY).toEqual({
      width: 27.6,
      height: 30.36,
      anchorX: 13.8,
      anchorY: 30.36,
      outlineWidth: 2,
    });
  });

  test("variants differ only by icon, unselected color, and text y-position", () => {
    expect(Object.keys(MARKER_PIN_VARIANTS.standard).sort()).toEqual([
      "baseColor",
      "iconPath",
      "textYPercent",
    ]);
    expect(Object.keys(MARKER_PIN_VARIANTS.favorite).sort()).toEqual([
      "baseColor",
      "iconPath",
      "textYPercent",
    ]);
    expect(markerPinVariant(false)).toBe(MARKER_PIN_VARIANTS.standard);
    expect(markerPinVariant(true)).toBe(MARKER_PIN_VARIANTS.favorite);
  });

  test("both SVG paths terminate at the same bottom point", () => {
    expect(MARKER_PIN_VARIANTS.standard.iconPath.endsWith("Z")).toBe(true);
    expect(MARKER_PIN_VARIANTS.favorite.iconPath).toContain("M20 42");
    expect(MARKER_PIN_VARIANTS.standard.iconPath).toContain("M20 42");
  });

  test("number labels paint white after the shape in the same SVG tree", () => {
    expect(appSource).toContain('<text class="event-pin-number"');
    expect(appSource).toMatch(/<path d=\"\$\{variant\.iconPath\}\" \/>\$\{number\}<\/svg>/);
    const numberRule = themeCss.match(/\.event-pin-number\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(numberRule).toContain("fill: var(--on-dark)");
    expect(numberRule).toContain("paint-order: stroke fill");
    expect(numberRule).toContain("text-anchor: middle");
  });
});
