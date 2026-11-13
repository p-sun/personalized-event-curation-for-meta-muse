import { describe, expect, test } from "bun:test";

const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();
const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

const declaration = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return themeCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

const locationViewSource = appSource.slice(
  appSource.indexOf("function LocationView("),
  appSource.indexOf("function useAdaptiveFilterAlignment"),
);

describe("location details layout", () => {
  test("the pushed screen scrolls only vertically", () => {
    const screen = declaration(".navigation-stack-screen");
    expect(screen).toContain("overflow-x: hidden");
    expect(screen).toContain("overflow-y: auto");
  });

  test("one page container constrains all location-detail content", () => {
    const locationView = declaration(".location-view");
    expect(locationView).toContain("inline-size: 100%");
    expect(locationView).toContain("min-inline-size: 0");
    expect(locationView).toContain("max-inline-size: 100%");
  });

  test("the location header can shrink and wrap instead of widening the page", () => {
    expect(declaration(".location-profile-content")).toContain("min-width: 0");
    expect(declaration(".location-profile h1")).toContain("max-width: 100%");
    expect(declaration(".location-profile h1")).toContain("overflow-wrap: anywhere");
  });

  test("the location header is a plain top-aligned chevron and title", () => {
    expect(locationViewSource).toContain("<ChevronLeftIcon />");
    expect(locationViewSource).toContain('aria-label="Back to events"');
    expect(locationViewSource).not.toContain("backLabel");
    expect(locationViewSource).not.toContain("location-profile-mark");
    expect(declaration(".location-profile")).toContain("align-items: start");
    expect(declaration(".location-back")).toContain("align-self: start");
  });

  test("location details reuse the complete main filter chrome", () => {
    expect(locationViewSource).toContain("<EventFilterBar");
    expect(locationViewSource).toContain("calendarOccurrencesOverride=");
    expect(locationViewSource).not.toContain("<DateFilterControl");
    expect(locationViewSource).not.toContain("<ToggleButton");
    expect(themeCss).not.toContain(".location-filter-bar");
  });
});
