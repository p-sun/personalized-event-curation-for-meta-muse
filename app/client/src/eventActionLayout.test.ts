import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

const declaration = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return themeCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

describe("event card action-row layout", () => {
  test("groups all external links separately from the trailing hide button", () => {
    const start = appSource.indexOf("function EventActionButtons(");
    const end = appSource.indexOf("function EventCard(", start);
    const component = appSource.slice(start, end);

    expect(component).toContain('<div className="event-action-buttons">');
    expect(component).toContain('<div className="event-action-links">');
    expect(component.indexOf('<div className="event-action-links">')).toBeLessThan(
      component.indexOf('className="event-hide-button"'),
    );
  });

  test("uses card padding for equal leading and trailing insets", () => {
    const body = declaration(".event-body");
    const row = declaration(".event-action-buttons");
    const links = declaration(".event-action-links");
    const hide = declaration(".event-hide-button");

    expect(body).toContain("padding: var(--space-4) var(--card-leading)");
    expect(row).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(row).not.toMatch(/padding|margin-left|margin-right/);
    expect(links).toContain("flex-wrap: wrap");
    expect(hide).toContain("margin: 0");
    expect(hide).toContain("padding: 0");
  });
});
