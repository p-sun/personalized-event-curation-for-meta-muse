import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

describe("saved user location", () => {
  test("restores cached coordinates before maps mount without starting geolocation", () => {
    const restoreBlock = appSource.slice(
      appSource.indexOf("function restoreSharedUserLocation"),
      appSource.indexOf("function refreshSharedUserLocation"),
    );
    expect(restoreBlock).toContain('sharedUserLocation = { status: "ready", position, error: null }');
    expect(restoreBlock).not.toContain("navigator.geolocation");
    expect(appSource).toContain("restoreSharedUserLocation(preferences.settings.lastKnownLocation)");
  });

  test("persists coordinates and the independent locate-sort choice through the central preferences record", () => {
    expect(appSource).toContain("locateMeEnabled,");
    expect(appSource).toContain("lastKnownLocation: appUserLocation.position");
  });

  test("uses a labeled Popular/Near me selector beside the date picker", () => {
    const dateControls = appSource.slice(
      appSource.indexOf('className="date-filter-selectors"'),
      appSource.indexOf("{showLocationConsent &&"),
    );
    expect(dateControls).toContain('className={`sort-picker ${sortMenuOpen ? "is-open" : ""}`}');
    expect(dateControls).toContain('{locateMeEnabled ? "Near me" : "Popular"}');
    expect(dateControls).toContain('role="radiogroup" aria-label="Sort events"');
    expect(dateControls).toContain('onClick={() => selectSort("popular", close)}');
    expect(dateControls).toContain('onClick={() => selectSort("distance", close)}');
    expect(appSource).toContain("onLocateMeEnabledChange(true)");
    expect(appSource).toContain("onLocateMeEnabledChange(false)");
    expect(appSource).toContain("refreshSharedUserLocation()");
    expect(dateControls.indexOf("sort-picker")).toBeLessThan(dateControls.indexOf('className="segmented date-filter"'));
    expect(themeCss).toMatch(/\.sort-picker > \.popup-menu-trigger\s*\{[^}]*height:\s*var\(--filter-control-height\)/s);
    expect(themeCss).toMatch(/\.sort-picker > \.popup-menu-trigger > span::before\s*\{[^}]*transform:\s*rotate\(45deg\)/s);
  });

  test("asks for location consent only when Near me needs an uncached position", () => {
    const selectSortBlock = appSource.slice(
      appSource.indexOf('const selectSort = (mode: "popular" | "distance"'),
      appSource.indexOf("const allowLocation"),
    );
    expect(selectSortBlock).toContain('if (mode === "popular")');
    expect(selectSortBlock).toContain("onLocateMeEnabledChange(false)");
    expect(selectSortBlock).toContain("if (!userLocation.position)");
    expect(selectSortBlock).toContain("setShowLocationConsent(true)");
    expect(selectSortBlock).toContain("onLocateMeEnabledChange(true)");
  });

  test("shows the saved blue location marker independently of the distance-sort choice", () => {
    const markerEffect = appSource.slice(
      appSource.indexOf("const position = userLocation.position;"),
      appSource.indexOf("for (const group of pinGroups)", appSource.indexOf("const position = userLocation.position;")),
    );
    expect(markerEffect).toContain("if (!map || !position) return;");
    expect(markerEffect).toContain('className: "user-location-marker-shell"');
    expect(markerEffect).not.toContain("locateMeEnabled");
  });

  test("derives the secondary sort from the choice while keeping the saved marker independent", () => {
    expect(appSource).toContain('const sortBy: EventSortMode = locateMeEnabled && appUserLocation.position ? "distance" : "ig_mentions";');
  });
});
