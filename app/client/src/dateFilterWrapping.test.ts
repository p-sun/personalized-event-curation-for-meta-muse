import { describe, expect, test } from "bun:test";

const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

const declarations = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return themeCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

describe("date filter wrapping", () => {
  test("wraps the date selector beneath Sort while keeping the segmented control intact", () => {
    const row = declarations(".date-filter-selectors");
    const dateControl = declarations(".date-filter-selectors .date-filter");

    expect(row).toContain("flex-wrap: wrap");
    expect(row).toContain("max-width: 100%");
    expect(dateControl).toContain("flex: 0 0 auto");
    expect(dateControl).toContain("max-width: 100%");
  });

  test("tightens date-button padding on narrow phones so the complete selector fits", () => {
    expect(themeCss).toMatch(/@media \(max-width: 420px\)[\s\S]*?\.filter-primary-row \.date-filter button\s*\{\s*padding-inline:\s*5px;/);
  });
});
