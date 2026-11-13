import { describe, expect, test } from "bun:test";

const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();
const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

const declaration = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return themeCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

const settingsViewPicker = appSource.slice(
  appSource.indexOf('<fieldset className="view-picker">'),
  appSource.indexOf('<fieldset className="theme-picker">'),
);

describe("View selection lives in Settings, not the top bar", () => {
  test("the top filter bar no longer renders the A/B/C segmented control", () => {
    expect(appSource).not.toContain("view-tabs");
    expect(appSource).not.toContain('aria-label="Event views"');
    expect(themeCss).not.toContain(".view-tabs");
    // The rest of the filter bar is untouched.
    expect(appSource).toContain('<section className="discovery-tools" aria-label="Find and filter events">');
    expect(appSource).toContain("<EventFilterBar />");
  });

  test("Settings offers A, B, and C with the segmented control's labels, wired to the same view state", () => {
    expect(settingsViewPicker).toContain("<legend>View</legend>");
    expect(settingsViewPicker).toContain('aria-label="View"');
    for (const [view, label] of [
      ["feed", "Option A"],
      ["map", "Option B"],
      ["explore", "Option C"],
    ] as const) {
      expect(appSource).toContain(`{ view: "${view}", label: "${label}" }`);
    }
    expect(settingsViewPicker).toContain("setView(item.view)");
    expect(settingsViewPicker).toContain("aria-pressed={view === item.view}");
    expect(settingsViewPicker).toContain("setSettingsMenuOpen(false)");
  });

  test("selecting each view in Settings renders that view", () => {
    // One view state drives both the Settings picker and the rendered screen.
    expect(appSource).toContain("const [view, setView] = useState<View>(initialPreferences.settings.view)");
    expect(appSource).toContain('view === "feed" ? (');
    expect(appSource).toContain("<FeedView");
    expect(appSource).toContain('view === "map" ? (');
    expect(appSource).toContain("<MapView");
    expect(appSource).toContain("<ExploreView");
    // Option C keeps its standing behavior: it opens directly in fullscreen.
    const exploreView = appSource.slice(
      appSource.indexOf("function ExploreView("),
      appSource.indexOf("function IGSourceRow("),
    );
    expect(exploreView).toContain("useMapFullscreen(true)");
  });

  test("keeps the Settings view selector compact with the shared control shadow on the active option", () => {
    const options = declaration(".view-options");
    expect(options).toContain("height: 36px");
    expect(options).toContain("padding: 2px");
    expect(options).toContain("grid-template-columns: repeat(3, 1fr)");
    expect(declaration(".view-options button.active")).toContain("box-shadow: var(--filter-control-shadow)");
    const intro = declaration(".page-intro");
    expect(intro).toContain("padding: 18px 1px 16px");
  });
});
