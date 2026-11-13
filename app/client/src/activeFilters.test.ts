import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

describe("active filter visibility", () => {
  test("a populated search field has a persistent active treatment", () => {
    expect(appSource).toContain('className={`search-field ${searchQuery.trim() ? "is-filter-active" : ""}`}');
    expect(themeCss).toContain(".search-field.is-filter-active,");
    expect(themeCss).toContain("box-shadow: var(--filter-control-shadow), inset 0 0 0 2px var(--accent)");
  });

  test("the category trigger uses an active state and a numeric selection badge", () => {
    expect(appSource).toContain('className={`popup-menu-trigger ${selectedCategories.length > 0 ? "is-filter-active" : ""}`}');
    expect(appSource).toContain('<span className="category-trigger-label">Categories</span>');
    expect(appSource).toContain('<span className="filter-count" aria-hidden="true">{selectedCategories.length}</span>');
    expect(appSource).toContain("`Filter by categories, ${selectedCategories.length} selected`");
    expect(themeCss).toContain(".filter-count {");
  });

  test("selected one-tap filters use the same emphasized state", () => {
    expect(themeCss).toContain(".filter-secondary-row .ui-toggle.is-selected,");
    expect(themeCss).toContain("background: var(--accent-soft)");
    expect(themeCss).toContain("color: var(--accent-strong)");
  });

  test("the collapsed fullscreen filter button exposes the active count", () => {
    expect(appSource).toContain("const activeFilterCount = Number(Boolean(searchQuery.trim()))");
    expect(appSource).toContain("+ selectedCategories.length;");
    expect(appSource).toContain('className={`fullscreen-filter-toggle ${activeFilterCount > 0 ? "has-active-filters" : ""}`}');
    expect(appSource).toContain('<span className="active-filter-count" aria-hidden="true">{activeFilterCount}</span>');
    expect(appSource).toContain('`${open ? "Hide" : "Show"} map filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""}`');
    expect(themeCss).toContain(".fullscreen-filter-toggle.has-active-filters");
    expect(themeCss).toContain(".active-filter-count {");
  });
});
