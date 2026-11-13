import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

describe("fullscreen map filters", () => {
  test("the shared fullscreen map experience puts the close control before the top-left filter toggle", () => {
    const sharedMap = appSource.slice(
      appSource.indexOf("function MapWithEventCards("),
      appSource.indexOf("function ExploreView("),
    );
    const fullscreenFilters = appSource.slice(
      appSource.indexOf("function FullscreenMapFilters("),
      appSource.indexOf("function FitMapIcon("),
    );
    const backControl = fullscreenFilters.indexOf('className="location-back fullscreen-map-back"');
    const filterToggle = fullscreenFilters.indexOf('className={`fullscreen-filter-toggle ${activeFilterCount > 0 ? "has-active-filters" : ""}`}');
    expect(sharedMap).toContain("{fullscreen && (");
    expect(sharedMap).toContain("<FullscreenMapFilters");
    expect(sharedMap).toContain("onBack={onToggleFullscreen}");
    expect(sharedMap).not.toContain("trayPosition");
    expect(sharedMap).not.toContain("setFiltersOpen(nextPosition");
    expect(backControl).toBeGreaterThan(-1);
    expect(backControl).toBeLessThan(filterToggle);
    expect(fullscreenFilters).toContain('onClick={onBack}');
    expect(fullscreenFilters).toContain('aria-label="Exit full screen map"');
    expect(fullscreenFilters).toContain("<CloseIcon />");
    expect(appSource).toContain('aria-label={`${open ? "Hide" : "Show"} map filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""}`}');
    expect(themeCss).toMatch(/\.fullscreen-map-filter-layer\s*\{[^}]*left:\s*calc\(12px \+ env\(safe-area-inset-left\)\)/s);
    expect(themeCss).toMatch(/\.fullscreen-map-filter-layer\s*\{[^}]*top:\s*calc\(12px \+ env\(safe-area-inset-top\)\)/s);
  });

  test("the fullscreen filters start collapsed", () => {
    const sharedMap = appSource.slice(
      appSource.indexOf("function MapWithEventCards("),
      appSource.indexOf("function ExploreView("),
    );
    expect(sharedMap).toContain("const [filtersOpen, setFiltersOpen] = useState(false);");
  });

  test("the fullscreen panel reuses the same complete filter bar as the main screen", () => {
    const filterBar = appSource.slice(
      appSource.indexOf("function EventFilterBar("),
      appSource.indexOf("function FullscreenMapFilters("),
    );
    for (const control of [
      "Search events",
      "<FreeIcon /> Free",
      "<HeartIcon filled={favoritesOnly} /> Favs",
      "<LongRunningIcon /> Long",
      "Filter by categories",
      "<DateFilterControl",
    ]) {
      expect(filterBar).toContain(control);
    }
    expect(appSource).toContain('<section className="discovery-tools" aria-label="Find and filter events">\n            <EventFilterBar />');
    const fullscreenFilters = appSource.slice(
      appSource.indexOf("function FullscreenMapFilters("),
      appSource.indexOf("function ZoomInIcon("),
    );
    expect(fullscreenFilters).toContain('className={`fullscreen-map-filter-layer ${open ? "is-open" : ""}`}');
    expect(fullscreenFilters).toContain("<EventFilterBar leadingControl={leadingControls} searchOnly={!open} onSearchFocus={alignTrayBelowSearch} />");
  });

  test("a populated search stays visible while the other fullscreen filters are hidden", () => {
    const fullscreenFilters = appSource.slice(
      appSource.indexOf("function FullscreenMapFilters("),
      appSource.indexOf("function ZoomInIcon("),
    );
    const filterBar = appSource.slice(
      appSource.indexOf("function EventFilterBar("),
      appSource.indexOf("function FullscreenMapFilters("),
    );

    expect(fullscreenFilters).toContain("open || searchQuery");
    expect(fullscreenFilters).toContain("searchOnly={!open}");
    expect(filterBar).toContain("{!searchOnly && (");
    expect(filterBar).toContain("if (searchExpanded && !searchOnly)");
  });

  test("the fullscreen filters are an unframed content-sized overlay", () => {
    const fullscreenFilters = appSource.slice(
      appSource.indexOf("function FullscreenMapFilters("),
      appSource.indexOf("function ZoomInIcon("),
    );
    expect(fullscreenFilters).not.toContain("bottomOccluderRef");
    expect(fullscreenFilters).not.toContain("panelMaxHeight");
    expect(themeCss).toMatch(/\.fullscreen-map-filter-layer\s*\{[^}]*background:\s*var\(--transparent\)/s);
    expect(themeCss).not.toMatch(/\.fullscreen-map-filter-layer\s*\{[^}]*max-height:/s);
    expect(themeCss).toMatch(/\.fullscreen-map-filter-layer\s*\{[^}]*right:\s*calc\(12px \+ env\(safe-area-inset-right\)\)/s);
    expect(themeCss).toMatch(/\.fullscreen-map-filter-layer\s*\{[^}]*width:\s*auto/s);
    expect(themeCss).not.toContain("760px");
    expect(themeCss).not.toContain(".fullscreen-filter-panel");
  });

  test("the inline toggle and every filter share one wrapping flow", () => {
    expect(appSource).toContain("function EventFilterBar({\n  leadingControl,\n  searchOnly = false,\n  onSearchFocus,");
    expect(appSource).toContain("{leadingControl}\n        {searchExpanded ? (");
    expect(themeCss).toMatch(/\.fullscreen-map-filter-layer > \.filter-bar\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s);
    expect(themeCss).toMatch(/\.fullscreen-map-filter-layer \.filter-secondary-row,[\s\S]*?\.fullscreen-map-filter-layer \.date-filter-selectors\s*\{\s*display:\s*contents;/s);
    expect(themeCss).toMatch(/\.fullscreen-map-filter-layer \.date-filter\s*\{[^}]*flex-wrap:\s*wrap/s);
  });

  test("the back and filter controls share the filter-row height", () => {
    expect(themeCss).toMatch(/\.fullscreen-map-back\s*\{[^}]*height:\s*var\(--filter-control-height\)/s);
    expect(themeCss).toMatch(/\.fullscreen-map-back\s*\{[^}]*min-height:\s*var\(--filter-control-height\)/s);
    expect(themeCss).toMatch(/\.fullscreen-filter-toggle\s*\{[^}]*height:\s*var\(--filter-control-height\)/s);
    expect(themeCss).toMatch(/\.fullscreen-filter-toggle\s*\{[^}]*min-height:\s*var\(--filter-control-height\)/s);
    expect(themeCss).not.toMatch(/\.fullscreen-filter-toggle\s*\{[^}]*height:\s*40px/s);
  });

  test("the categories selector hugs its label and centers a drawn chevron", () => {
    expect(themeCss).toMatch(/\.category-picker\s*\{[^}]*width:\s*max-content/s);
    expect(themeCss).toMatch(/\.category-picker > \.popup-menu-trigger\s*\{[^}]*width:\s*max-content/s);
    expect(themeCss).not.toMatch(/\.category-picker > \.popup-menu-trigger\s*\{[^}]*min-width:/s);
    expect(themeCss).toMatch(/\.category-picker > \.popup-menu-trigger > \.category-trigger-chevron\s*\{[^}]*height:\s*100%[^}]*place-items:\s*center/s);
    expect(themeCss).toMatch(/\.category-picker > \.popup-menu-trigger > \.category-trigger-chevron::before\s*\{[^}]*transform:\s*rotate\(45deg\)/s);
    expect(appSource).toContain('<span className="category-trigger-chevron" aria-hidden="true" />');
  });
});
