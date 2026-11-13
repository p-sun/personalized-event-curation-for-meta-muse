import { describe, expect, test } from "bun:test";
import { THEMES } from "./themes";

const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();
const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

const declaration = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return themeCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

describe("filter-area control styling", () => {
  test("Categories and Popular use the same typography and color as filter buttons", () => {
    const filterButton = declaration(".ui-toggle");
    const categories = declaration(".category-picker > .popup-menu-trigger");
    const popular = declaration(".sort-picker > .popup-menu-trigger");
    for (const style of [categories, popular]) {
      expect(style).toContain("color: var(--filter-control-color)");
      expect(style).toContain("font-size: var(--filter-control-font-size)");
      expect(style).toContain("font-weight: var(--filter-control-font-weight)");
    }
    expect(filterButton).toContain("color: var(--filter-control-color)");
    expect(filterButton).toContain("font-size: var(--filter-control-font-size)");
    expect(filterButton).toContain("font-weight: var(--filter-control-font-weight)");
  });

  test("every filter-area control style owns the shared small shadow", () => {
    expect(THEMES["city-sage"].variables["--filter-control-shadow"]).toBe("0 2px 7px rgb(22 29 43 / 10%)");
    for (const selector of [
      ".ui-toggle",
      ".filter-search-button",
      ".search-field",
      ".segmented",
      ".sort-picker > .popup-menu-trigger",
      ".category-picker > .popup-menu-trigger",
      ".date-locate-button",
    ]) {
      expect(declaration(selector)).toContain("box-shadow: var(--filter-control-shadow)");
    }
  });

  test("focused and selected variants retain the outer shadow", () => {
    expect(declaration(".search-field:focus-within")).toContain("box-shadow: var(--filter-control-shadow), inset");
    expect(declaration(".sort-picker.is-open > .popup-menu-trigger")).toContain("box-shadow: var(--filter-control-shadow), inset");
    expect(declaration(".category-picker.is-open > .popup-menu-trigger")).toContain("box-shadow: var(--filter-control-shadow), inset");
    expect(declaration(".date-locate-button.is-enabled")).toContain("box-shadow: var(--filter-control-shadow), inset");
  });

  test("Option A's icon-only map toggle is large, legible, and more elevated", () => {
    const mapToggle = declaration(".feed-map-toggle");
    const mapIcon = declaration(".feed-map-toggle .control-icon");
    expect(mapToggle).toContain("--feed-map-toggle-size: 64px");
    expect(mapToggle).toContain("width: var(--feed-map-toggle-size)");
    expect(mapToggle).toContain("height: var(--feed-map-toggle-size)");
    expect(mapToggle).toContain("box-shadow: var(--feed-map-toggle-shadow)");
    expect(mapIcon).toContain("width: 63.75%");
    expect(mapIcon).toContain("height: 63.75%");
    expect(THEMES["city-sage"].variables["--feed-map-toggle-shadow"]).toBe(
      "0 5px 12px rgb(22 29 43 / 22%), 0 16px 34px rgb(22 29 43 / 28%), 0 28px 54px rgb(22 29 43 / 18%)",
    );
    expect(mapToggle).not.toContain("animation:");
    expect(declaration(".feed-map-toggle.should-bounce")).toContain("animation: feed-map-attention .9s");
    expect(declaration(".feed-map-toggle.is-open")).not.toContain("box-shadow");
    expect(mapToggle).toContain("right: var(--feed-map-toggle-right)");
    expect(declaration(".feed-with-map-tray.is-map-visible .feed-map-toggle")).toBe("");
    expect(appSource).toContain("let hasPlayedFeedMapButtonBounce = false");
    expect(appSource).toContain("if (hasPlayedFeedMapButtonBounce) return false");
    expect(appSource).toContain("hasPlayedFeedMapButtonBounce = true");
    expect(appSource).toContain("<MapIcon />");
    expect(appSource).not.toContain('<span>{mapVisible ? "Hide map" : "Map"}</span>');
    expect(themeCss).toContain("@keyframes feed-map-attention");
    expect(themeCss).toContain("translateY(-16px) scale(1.13)");
    expect(themeCss).toContain("filter: brightness(1.08)");
    expect(themeCss).toContain(".feed-map-toggle.should-bounce { animation: none; }");
  });

  test("one reusable rounded tray surface owns the shared outer shadow", () => {
    expect(THEMES["city-sage"].variables["--tray-outer-shadow"]).toBe(
      "0 -3px 12px rgb(22 29 43 / 24%), 0 -16px 36px rgb(22 29 43 / 16%)",
    );
    const traySurface = declaration(".modal-tray-surface");
    expect(traySurface).toContain("border-radius: 24px 24px 0 0");
    expect(traySurface).toContain("box-shadow: var(--tray-outer-shadow)");
    expect(declaration(".modal-tray")).not.toContain("box-shadow");
    expect(declaration(".feed-map-tray")).not.toContain("box-shadow");
  });

  test("fullscreen map controls use a deeper shadow without changing the shared base style", () => {
    expect(declaration(".fullscreen-map-filter-layer")).toContain(
      "--filter-control-shadow: var(--fullscreen-control-shadow)",
    );
    expect(declaration(".fullscreen-filter-toggle")).toContain("box-shadow: var(--filter-control-shadow)");
    expect(themeCss).toContain(".map-stage.is-fullscreen .map-floating-controls .ui-icon-button");
    expect(themeCss).toContain("box-shadow: var(--fullscreen-control-shadow)");
  });
});
