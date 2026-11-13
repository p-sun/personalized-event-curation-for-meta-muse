import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const dateControl = appSource.slice(
  appSource.indexOf("function DateFilterControl("),
  appSource.indexOf("function EventFilterBar("),
);

describe("Calendar date filter persistence", () => {
  test("the Calendar button opens or closes only the picker without deselecting Calendar or resetting its range", () => {
    const openHandlerStart = dateControl.indexOf("const setCalendarMenuOpen");
    const openHandlerEnd = dateControl.indexOf("return (", openHandlerStart);
    const openHandler = dateControl.slice(openHandlerStart, openHandlerEnd);

    expect(openHandler).toContain("if (!nextOpen)");
    expect(openHandler).toContain("setCalendarOpen(false)");
    expect(openHandler).toContain("if (!calendarSelected)");
    expect(openHandler).toContain("activateCalendarPicker(selectedDate, selectedEndDate || null, today)");
    expect(openHandler).toContain("setCalendarOpen(true)");
    expect(openHandler).not.toContain('setSelection("future")');
    expect(openHandler).not.toContain("onSelectRange(today, null)");
  });

  test("the active Calendar filter is independent from whether its popup is open", () => {
    expect(dateControl).toContain('className={`popup-menu-trigger calendar-choice ${calendarSelected ? "active" : ""}`}');
    expect(dateControl).toContain("aria-pressed={calendarSelected}");
    expect(dateControl).toContain("open={calendarOpen}");
    expect(dateControl).toContain("onOpenChange={setCalendarMenuOpen}");
    expect(dateControl).not.toContain("{calendarSelected && calendarOpen && (");
  });

  test("selecting either range endpoint leaves the shared popup open", () => {
    const chooseStart = dateControl.indexOf("const chooseCalendarDay");
    const chooseEnd = dateControl.indexOf("const rangeSummary", chooseStart);
    const chooseCalendarDay = dateControl.slice(chooseStart, chooseEnd);

    expect(chooseCalendarDay).toContain("onSelectRange(next.range.startDate, next.range.endDate)");
    expect(chooseCalendarDay).toContain("setAwaitingRangeEnd(next.awaitingEnd)");
    expect(chooseCalendarDay).not.toContain("setCalendarOpen");
    expect(chooseCalendarDay).not.toContain("onDateFilter");
  });
});
