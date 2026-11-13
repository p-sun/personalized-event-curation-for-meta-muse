function parseCalendarDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function dateParts(value: string): { year: string; month: string; day: string; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).formatToParts(parseCalendarDate(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    weekday: get("weekday"),
  };
}

/**
 * Formats the authoritative start/end fields without collapsing a multi-day
 * occurrence to its first day. Single-day events keep the weekday used across
 * the app; ranges stay compact while always showing both endpoints.
 */
export function formatEventDateRange(startDate: string, endDate?: string | null): string {
  const start = dateParts(startDate);
  if (!endDate || endDate === startDate) {
    return `${start.weekday} ${start.month} ${start.day}`;
  }

  const end = dateParts(endDate);
  if (start.year !== end.year) {
    return `${start.month} ${start.day}, ${start.year}–${end.month} ${end.day}, ${end.year}`;
  }
  if (start.month !== end.month) {
    return `${start.month} ${start.day}–${end.month} ${end.day}`;
  }
  return `${start.month} ${start.day}–${end.day}`;
}
