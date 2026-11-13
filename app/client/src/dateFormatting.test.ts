import { describe, expect, test } from "bun:test";
import { formatEventDateRange } from "./dateFormatting";

describe("formatEventDateRange", () => {
  test("keeps the weekday for a single-day occurrence", () => {
    expect(formatEventDateRange("2026-09-11", null)).toBe("Fri Sep 11");
  });

  test("shows the full compact range within one month", () => {
    expect(formatEventDateRange("2026-09-11", "2026-09-13")).toBe("Sep 11–13");
  });

  test("shows both months when a range crosses a month boundary", () => {
    expect(formatEventDateRange("2026-09-30", "2026-10-02")).toBe("Sep 30–Oct 2");
  });

  test("shows both years when a range crosses a year boundary", () => {
    expect(formatEventDateRange("2026-12-30", "2027-01-02")).toBe("Dec 30, 2026–Jan 2, 2027");
  });
});
