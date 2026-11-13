import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const datePickerMarkup = appSource.match(
  /<div className="segmented date-filter" aria-label="Date picker">([\s\S]*?)<\/div>/,
)?.[1] ?? "";

describe("date filter options", () => {
  test("offers Upcoming instead of Future and removes All", () => {
    expect(datePickerMarkup).toContain(">Upcoming</StyledButton>");
    expect(datePickerMarkup).not.toContain(">Future</button>");
    expect(datePickerMarkup).not.toContain(">All</button>");
  });

  test("keeps Upcoming wired to the existing future filter behavior", () => {
    expect(datePickerMarkup).toContain('dateFilter === "future"');
    expect(datePickerMarkup).toContain('setSelection("future")');
  });
});
