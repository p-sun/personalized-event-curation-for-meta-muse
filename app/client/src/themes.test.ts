import { describe, expect, test } from "bun:test";
import { applyTheme, DEFAULT_THEME_ID, THEMES, THEME_OPTIONS } from "./themes";

const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();
const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

describe("theme system", () => {
  test("provides the current palette plus three complete alternatives", () => {
    expect(DEFAULT_THEME_ID).toBe("museum-blue");
    expect(THEME_OPTIONS.map(({ id }) => id)).toEqual([
      "city-sage",
      "night-market",
      "museum-blue",
      "sunlit-amber",
    ]);

    const expectedVariables = Object.keys(THEMES[DEFAULT_THEME_ID].variables).sort();
    expect(expectedVariables.length).toBeGreaterThan(80);
    for (const theme of THEME_OPTIONS) {
      expect(Object.keys(theme.variables).sort()).toEqual(expectedVariables);
      expect(theme.variables["--bg"]).toBeTruthy();
      expect(theme.variables["--surface"]).toBeTruthy();
      expect(theme.variables["--text"]).toBeTruthy();
      expect(theme.variables["--accent"]).toBeTruthy();
      expect(theme.variables["--favorite-pin"]).toBeTruthy();
      expect(theme.variables["--filter-control-shadow"]).toBeTruthy();
    }
  });

  test("uses the same bright-green highlighted-pin color in City Sage and Museum Blue", () => {
    expect(THEMES["museum-blue"].variables["--emphasis"]).toBe(
      THEMES["city-sage"].variables["--emphasis"],
    );
    expect(THEMES["museum-blue"].variables["--selected-pin-shadow"]).toBe(
      THEMES["city-sage"].variables["--selected-pin-shadow"],
    );
  });

  test("applies every selected-theme variable and color scheme to one root", () => {
    const values = new Map<string, string>();
    const target = {
      style: {
        colorScheme: "",
        setProperty(property: string, value: string) { values.set(property, value); },
      },
      dataset: {},
    } as unknown as HTMLElement;

    applyTheme("night-market", target);

    expect(values.size).toBe(Object.keys(THEMES["night-market"].variables).length);
    expect(values.get("--bg")).toBe(THEMES["night-market"].variables["--bg"]);
    expect(values.get("--accent")).toBe(THEMES["night-market"].variables["--accent"]);
    expect(target.style.colorScheme).toBe("dark");
    expect(target.dataset.appTheme).toBe("night-market");
  });

  test("keeps color literals in the TypeScript theme object, not component CSS", () => {
    const rawColor = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|(?<![-\w])(?:white|black|transparent)(?![-\w])/i;
    expect(themeCss.match(rawColor)).toBeNull();
  });

  test("uses each theme's accent contrast token on primary buttons", () => {
    const primaryButton = themeCss.match(/\.primary-button\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(THEMES["night-market"].variables["--accent-contrast"]).toBe("#0e1a16");
    expect(primaryButton).toContain("background: var(--accent)");
    expect(primaryButton).toContain("color: var(--accent-contrast)");
    expect(primaryButton).not.toContain("color: var(--on-dark)");
  });

  test("renders the Settings picker from the shared theme inventory", () => {
    expect(appSource).toContain("THEME_OPTIONS.map");
    expect(appSource).toContain('name="app-theme"');
    expect(appSource).toContain("onChange={() => setTheme(option.id)}");
    expect(appSource).toContain("applyTheme(theme)");
  });
});
