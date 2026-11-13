import { describe, expect, test } from "bun:test";
import { visibleMapPinLabelIds, type MapLabelRect } from "./mapPinLabels";

const map: MapLabelRect = { top: 0, right: 320, bottom: 240, left: 0 };
const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

function rect(left: number, top: number, right: number, bottom: number): MapLabelRect {
  return { left, top, right, bottom };
}

describe("visibleMapPinLabelIds", () => {
  test("returns every location label that fits", () => {
    const visible = visibleMapPinLabelIds([
      { id: "one", rect: rect(22, 70, 112, 96) },
      { id: "two", rect: rect(172, 146, 262, 172) },
    ], map, [rect(46, 20, 86, 60), rect(196, 96, 236, 136)]);

    expect([...visible]).toEqual(["one", "two"]);
  });

  test("keeps one deterministic label when two location labels collide", () => {
    const visible = visibleMapPinLabelIds([
      { id: "one", rect: rect(55, 64, 144, 90) },
      { id: "two", rect: rect(110, 72, 199, 98) },
    ], map, []);

    expect([...visible]).toEqual(["one"]);
  });

  test("hides only the label that hits a pin or map edge", () => {
    const blocked = visibleMapPinLabelIds([
      { id: "clear", rect: rect(20, 64, 109, 90) },
      { id: "blocked", rect: rect(154, 64, 243, 90) },
    ], map, [rect(215, 58, 255, 98)]);
    const clipped = visibleMapPinLabelIds([
      { id: "clear", rect: rect(20, 64, 109, 90) },
      { id: "clipped", rect: rect(235, 190, 324, 216) },
    ], map, []);

    expect([...blocked]).toEqual(["clear"]);
    expect([...clipped]).toEqual(["clear"]);
  });

  test("uses marker priority to choose between competing labels", () => {
    const visible = visibleMapPinLabelIds([
      { id: "ordinary", rect: rect(55, 64, 144, 90), priority: 1 },
      { id: "selected", rect: rect(110, 72, 199, 98), priority: 100 },
    ], map, []);

    expect([...visible]).toEqual(["selected"]);
  });

  test("allows a title five pixels below its own pin with the default gap", () => {
    const visible = visibleMapPinLabelIds(
      [{ id: "one", rect: rect(20, 49, 109, 75) }],
      map,
      [rect(45, 0, 85, 44)],
    );

    expect([...visible]).toEqual(["one"]);
  });

  test("renders the event title below each pin at the reduced width", () => {
    const pinLabelRule = themeCss.match(/\.event-pin-title\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(appSource).toContain("escapeMarkerText(primaryItem.event.title)");
    expect(pinLabelRule).toContain("top: calc(100% + 5px)");
    expect(pinLabelRule).toContain("left: 50%");
    expect(pinLabelRule).toContain("max-width: 89px");
    expect(pinLabelRule).toContain("transform: translateX(-50%)");
  });
});
