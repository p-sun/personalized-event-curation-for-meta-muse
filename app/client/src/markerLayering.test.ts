import { describe, expect, test } from "bun:test";

const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

describe("Leaflet marker layering", () => {
  test("marker CSS does not override Leaflet's per-marker z-index", () => {
    expect(themeCss).not.toMatch(/\.event-pin-shell\s*\{[^}]*z-index/s);
    expect(themeCss).not.toMatch(/\.user-location-marker-shell\s*\{[^}]*z-index/s);
  });
});
