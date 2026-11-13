import { describe, expect, test } from "bun:test";
import { activateCalendarPicker, selectCalendarRangeDay } from "./calendarRange";

describe("activateCalendarPicker", () => {
  test("reopens with the previously selected range intact", () => {
    expect(activateCalendarPicker("2026-09-14", "2026-09-18", "2026-09-20")).toEqual({
      range: { startDate: "2026-09-14", endDate: "2026-09-18" },
      awaitingEnd: false,
    });
  });

  test("uses today only when no calendar selection exists yet", () => {
    expect(activateCalendarPicker("", null, "2026-09-20")).toEqual({
      range: { startDate: "2026-09-20", endDate: null },
      awaitingEnd: false,
    });
  });
});

describe("selectCalendarRangeDay", () => {
  test("uses the first tap as the start of a new range", () => {
    expect(selectCalendarRangeDay("2026-09-11", false, "2026-09-14")).toEqual({
      range: { startDate: "2026-09-14", endDate: null },
      awaitingEnd: true,
    });
  });

  test("uses the second tap as the end of the range", () => {
    expect(selectCalendarRangeDay("2026-09-14", true, "2026-09-18")).toEqual({
      range: { startDate: "2026-09-14", endDate: "2026-09-18" },
      awaitingEnd: false,
    });
  });

  test("orders the range when the second tap is earlier", () => {
    expect(selectCalendarRangeDay("2026-09-18", true, "2026-09-14")).toEqual({
      range: { startDate: "2026-09-14", endDate: "2026-09-18" },
      awaitingEnd: false,
    });
  });

  test("starts a fresh range after a completed selection", () => {
    expect(selectCalendarRangeDay("2026-09-14", false, "2026-09-20")).toEqual({
      range: { startDate: "2026-09-20", endDate: null },
      awaitingEnd: true,
    });
  });
});
