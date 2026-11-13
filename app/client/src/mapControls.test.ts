import { describe, expect, test } from "bun:test";
import { mapControlIsBlocked, mapControlsTopOffset, type MapControlsConfig } from "./mapControls";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

describe("map control blocklist", () => {
  test("new controls are enabled by default", () => {
    expect(mapControlIsBlocked(undefined, "fullscreen")).toBe(false);
    expect(mapControlIsBlocked({}, "locate")).toBe(false);
    expect(mapControlIsBlocked({}, "zoom")).toBe(false);
  });

  test("only explicitly blocked controls are removed", () => {
    const withoutZoom: MapControlsConfig = { blocklist: ["zoom"] };
    expect(mapControlIsBlocked(withoutZoom, "zoom")).toBe(true);
    expect(mapControlIsBlocked(withoutZoom, "fullscreen")).toBe(false);
    expect(mapControlIsBlocked(withoutZoom, "locate")).toBe(false);
  });

  test("fullscreen controls begin immediately below the filter overlay", () => {
    expect(mapControlsTopOffset(0, null)).toBe(0);
    expect(mapControlsTopOffset(0, 128)).toBe(124);
    expect(mapControlsTopOffset(80, 180)).toBe(96);
    expect(mapControlsTopOffset(100, 80)).toBe(0);
  });

  test("zoom uses the shared top-left map control cluster and only displays at desktop width", () => {
    expect(appSource).not.toContain("L.control.zoom");
    expect(appSource).toContain('className="map-zoom-controls"');
    expect(appSource).toContain('className="map-floating-controls"');
    expect(themeCss).toMatch(/\.map-floating-controls\s*\{[^}]*top:\s*calc\(12px \+ env\(safe-area-inset-top\) \+ var\(--map-controls-top-offset, 0px\)\)/s);
    expect(themeCss).toMatch(/\.map-floating-controls\s*\{[^}]*left:\s*calc\(12px \+ env\(safe-area-inset-left\)\)/s);
    expect(themeCss).not.toMatch(/\.map-floating-controls\s*\{[^}]*right:/s);
    expect(themeCss).not.toMatch(/\.map-floating-controls\s*\{[^}]*bottom:/s);
    expect(themeCss).toMatch(/\.map-floating-controls\s*\{[^}]*align-content:\s*start/s);
    expect(themeCss).toMatch(/\.map-floating-controls\s*\{[^}]*justify-items:\s*start/s);
    expect(themeCss).toMatch(/\.map-zoom-controls\s*\{[^}]*display:\s*none/s);
    expect(themeCss).toMatch(/@media\s*\(min-width:\s*720px\)\s*\{[\s\S]*?\.map-zoom-controls\s*\{[^}]*display:\s*grid/s);
    expect(appSource).toContain("mapControlsTopOffset(");
    expect(appSource).toContain("observer.observe(overlay)");
    expect(themeCss).not.toContain("--map-controls-bottom-offset");
    expect(themeCss).not.toContain(".leaflet-control-zoom");
  });
});
