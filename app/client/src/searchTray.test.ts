import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const themeSource = await Bun.file(new URL("./theme.css", import.meta.url)).text();

describe("search tray clear action", () => {
  test("the clear-search x is rendered inside the search field", () => {
    const filterBar = appSource.slice(
      appSource.indexOf("function EventFilterBar("),
      appSource.indexOf("function FullscreenMapFilters("),
    );
    const fieldStart = filterBar.indexOf('<div className={`search-field ${searchQuery.trim() ? "is-filter-active" : ""}`}>');
    const fieldEnd = filterBar.indexOf("</div>", fieldStart);
    const field = filterBar.slice(fieldStart, fieldEnd);

    expect(field).toContain('className="search-clear-button"');
    expect(field).toContain('aria-label="Clear search"');
    expect(field).toContain("<CloseIcon />");
    expect(field).not.toContain(">Clear</Button>");
  });

  test("the x uses the primary color", () => {
    expect(themeSource).toContain(".search-clear-button {");
    expect(themeSource).toContain("color: var(--accent);");
  });

  test("focusing fullscreen search raises the event tray just below the search field", () => {
    expect(appSource).toContain("onFocus={onSearchFocus}");
    expect(appSource).toContain('querySelector<HTMLElement>(".search-field")');
    expect(appSource).toContain('closest<HTMLElement>(".filter-bar")');
    expect(appSource).toContain("window.getComputedStyle(filterBar).rowGap");
    expect(appSource).toContain("searchField.getBoundingClientRect().bottom + rowGap");
    expect(appSource).toContain("cardsTrayController.current?.revealBelowViewportBoundary(searchTrayBoundary)");
    expect(appSource).not.toContain('querySelector<HTMLElement>(".date-filter")');
  });
});
