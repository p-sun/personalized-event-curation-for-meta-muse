export type CalendarRange = {
  startDate: string;
  endDate: string | null;
};

export type CalendarRangeSelection = {
  range: CalendarRange;
  awaitingEnd: boolean;
};

/**
 * Opens the calendar without mutating its active range. A range chosen
 * earlier in this session is date-filter state, not popup state; only a
 * genuinely empty range falls back to today.
 */
export function activateCalendarPicker(
  currentStartDate: string,
  currentEndDate: string | null,
  today: string,
): CalendarRangeSelection {
  return {
    range: {
      startDate: currentStartDate || today,
      endDate: currentEndDate || null,
    },
    awaitingEnd: false,
  };
}

export function selectCalendarRangeDay(
  currentStartDate: string,
  awaitingEnd: boolean,
  day: string,
): CalendarRangeSelection {
  if (!awaitingEnd) {
    return {
      range: { startDate: day, endDate: null },
      awaitingEnd: true,
    };
  }

  const [startDate, endDate] = day < currentStartDate
    ? [day, currentStartDate]
    : [currentStartDate, day];

  return {
    range: { startDate, endDate },
    awaitingEnd: false,
  };
}
