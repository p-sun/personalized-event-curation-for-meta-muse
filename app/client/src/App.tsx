import { createContext, useCallback, useContext, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import * as L from "leaflet";
import { createPortal } from "react-dom";
import { api, type ApiResponse } from "./api";
import { EventImage, hasEventImage } from "./EventImage";
import { IconButton, PopupMenu, StyledButton, ToggleButton, usePresenceTransition } from "./ui";
import { googleMapsDirectionsUrl } from "./googleMaps";
import { activateCalendarPicker, selectCalendarRangeDay } from "./calendarRange";
import { formatEventDateRange } from "./dateFormatting";
import { numberFilteredItems } from "./numberFilteredItems";
import { MARKER_PIN_GEOMETRY, MARKER_PIN_VIEWBOX, markerPinVariant } from "./markerPins";
import { markerZIndexOffset, USER_LOCATION_PANE, USER_LOCATION_PANE_Z_INDEX } from "./markerStacking";
import { visibleMapPinLabelIds, type MapLabelRect } from "./mapPinLabels";
import { visibleMapFrame } from "./mapFraming";
import { mapControlIsBlocked, mapControlsTopOffset, type MapControlsConfig } from "./mapControls";
import { selectAndFrameEvent, titleBubbleForHighlight } from "./mapSelection";
import { nearestMeasurableContainerInnerWidth, shouldFullyAlignFilterRow } from "./filterAlignment";
import { igMentionCounterLabel, shouldShowIgMentionCounter } from "./igMentionCounter";
import { formatFollowerCount } from "./igSources";
import { sortEventOccurrences, type EventSortMode, type UserCoordinates } from "./eventSorting";
import { appPreferencesStore, createSessionFilters, probeBrowserLocalStorage, type AppView, type DateFilter } from "./localPreferences";
import { applyTheme, THEME_OPTIONS, type ThemeId } from "./themes";
import { NavigationStack, useNavigationStack } from "./navigationStack";
import {
adjacentTrayPosition,
advanceTrayContentGesture,
beginOwnedTrayDrag,
beginTrayContentGesture,
DEFAULT_TRAY_POSITIONS,
isScrollAtTop,
moveOwnedTrayDrag,
nearestTrayPosition,
releaseTrayContentGesture,
releaseTrayPosition,
shouldAdoptTrayViewportHeight,
trayHeightBelowViewportBoundary,
trayIsMovable,
traySnapHeight,
traySnapPoints,
type OwnedTrayDrag,
type TrayContentGesture,
type TrayPosition,
type TraySnapDefinition,
} from "./trayPhysics";

type ServerEventItem = ApiResponse<typeof api, "list_events">["events"][number];
type EventItem = ServerEventItem & { is_favorite: boolean; is_hidden: boolean };
type LocationItem = ApiResponse<typeof api, "list_locations">["locations"][number];
type IGSourceItem = ApiResponse<typeof api, "list_ig_sources">["sources"][number];
type OccurrenceItem = EventItem["occurrences"][number];
type LocationMap = Map<string, LocationItem>;
type LocationEventCounts = Map<string, number>;
type EventOccurrence = {
  event: EventItem;
  occurrence: OccurrenceItem;
  /** Rank among every unique event in the current filtered result. */
  eventNumber: number;
  /** Visible card/pin label, intentionally capped at 99. */
  displayNumber: number | null;
};
type VisibleEventModel = { events: EventItem[]; occurrences: EventOccurrence[] };
type FilterPipeline = { beforeDate: VisibleEventModel; visible: VisibleEventModel };
type View = AppView;

const VIEW_OPTIONS = [
  { view: "feed", label: "Option A" },
  { view: "map", label: "Option B" },
  { view: "explore", label: "Option C" },
] as const satisfies readonly { view: View; label: string }[];
type AppRoute = { type: "location"; locationId: string } | { type: "ig-sources" };
type DateSelection = { type: DateFilter; date: string; endDate: string | null };
type DateRange = { startDate: string | null; endDate: string | null };
type EventFilterControls = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  freeOnly: boolean;
  setFreeOnly: (value: boolean | ((current: boolean) => boolean)) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (value: boolean | ((current: boolean) => boolean)) => void;
  showLongRunning: boolean;
  setShowLongRunning: (value: boolean | ((current: boolean) => boolean)) => void;
  selectedCategories: string[];
  setSelectedCategories: (categories: string[] | ((current: string[]) => string[])) => void;
  availableCategories: string[];
  dateFilter: DateFilter;
  selectedDate: string;
  selectedEndDate: string;
  calendarOccurrences: EventOccurrence[];
  today: string;
  locateMeEnabled: boolean;
  setLocateMeEnabled: (enabled: boolean) => void;
  setDateFilter: (filter: DateFilter) => void;
  selectRange: (startDate: string, endDate: string | null) => void;
};

const EventFilterControlsContext = createContext<EventFilterControls | null>(null);

function useEventFilterControls(): EventFilterControls {
  const controls = useContext(EventFilterControlsContext);
  if (!controls) throw new Error("Event filter controls must be rendered inside their provider.");
  return controls;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function nycToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekBounds(today: string): { start: string; end: string } {
  const date = parseDate(today);
  const mondayOffset = (date.getDay() + 6) % 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset, 12);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 12);
  return { start: isoDate(start), end: isoDate(end) };
}

function dateRangeForSelection(selection: DateSelection, today: string): DateRange {
  if (selection.type === "today") return { startDate: today, endDate: today };
  if (selection.type === "tomorrow") {
    const date = parseDate(today);
    const tomorrow = isoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12));
    return { startDate: tomorrow, endDate: tomorrow };
  }
  if (selection.type === "week") return { startDate: today, endDate: weekBounds(today).end };
  if (selection.type === "calendar") return { startDate: selection.date || today, endDate: selection.endDate || null };
  return { startDate: today, endDate: null };
}

function occurrenceOverlapsDateRange(occurrence: OccurrenceItem, range: DateRange): boolean {
  if (range.startDate && occurrenceEnd(occurrence) < range.startDate) return false;
  if (range.endDate && occurrence.start_date > range.endDate) return false;
  return true;
}

function occurrenceEnd(occurrence: OccurrenceItem): string {
  return occurrence.end_date ?? occurrence.start_date;
}

function shortDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).formatToParts(parseDate(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("month")} ${get("day")}`;
}

const LONG_RUNNING_MIN_DAYS = 7;

function isLongRunningOccurrence(occurrence: OccurrenceItem): boolean {
  if (!occurrence.end_date || occurrence.end_date <= occurrence.start_date) return false;
  const start = Date.parse(`${occurrence.start_date}T12:00:00Z`);
  const end = Date.parse(`${occurrence.end_date}T12:00:00Z`);
  return (end - start) / 86_400_000 >= LONG_RUNNING_MIN_DAYS;
}

function occurrenceDateRange(occurrence: OccurrenceItem): string {
  return formatEventDateRange(occurrence.start_date, occurrence.end_date);
}

function groupedAdditionalDates(
  event: EventItem,
  primary: OccurrenceItem,
): Array<{ key: string; text: string }> {
  const remaining = event.occurrences
    .filter((occurrence) => occurrence.id !== primary.id)
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id));
  const groups = new Map<string, { weekday: string; month: string; days: string[]; timesText: string; showTime: boolean }>();
  const rows: Array<{ key: string; text: string; sortDate: string }> = [];

  for (const occurrence of remaining) {
    if (occurrence.end_date && occurrence.end_date !== occurrence.start_date) {
      rows.push({
        key: occurrence.id,
        text: `${occurrenceDateRange(occurrence)}${occurrence.times_text === primary.times_text ? "" : ` · ${occurrence.times_text}`}`,
        sortDate: occurrence.start_date,
      });
      continue;
    }
    const parts = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).formatToParts(parseDate(occurrence.start_date));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    const weekday = get("weekday");
    const month = get("month");
    const showTime = occurrence.times_text !== primary.times_text;
    const timesKey = showTime ? occurrence.times_text : "";
    const key = `${weekday}|${month}|${timesKey}`;
    const group = groups.get(key);
    if (group) group.days.push(get("day"));
    else groups.set(key, { weekday, month, days: [get("day")], timesText: occurrence.times_text, showTime });
  }

  for (const [key, group] of groups) {
    const first = remaining.find((occurrence) => {
      const date = shortDate(occurrence.start_date);
      return date.startsWith(`${group.weekday} ${group.month} `) && occurrence.times_text === group.timesText;
    });
    rows.push({
      key,
      text: `${group.weekday} ${group.month} ${group.days.join(", ")}${group.showTime ? ` · ${group.timesText}` : ""}`, 
      sortDate: first?.start_date ?? "9999-12-31",
    });
  }

  return rows.sort((a, b) => a.sortDate.localeCompare(b.sortDate)).map(({ key, text }) => ({ key, text }));
}

function calendarEntriesOn(occurrences: EventOccurrence[], day: string): EventOccurrence[] {
  return occurrences.filter(({ occurrence }) => occurrence.start_date <= day && occurrenceEnd(occurrence) >= day);
}

function syncedAtLabel(value: string): string {
  const date = new Date(value);
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((part) => part.type === type)?.value ?? "";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${get("weekday")} ${get("month")} ${get("day")} · ${time}`;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]!;
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

function fuzzyEventMatch(event: EventItem, query: string): boolean {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const haystack = normalizeSearch(`${event.title} ${event.venue} ${event.address} ${event.description}`);
  if (haystack.includes(normalizedQuery)) return true;
  const words = haystack.split(" ");
  return normalizedQuery.split(" ").every((needle) =>
    words.some((word) => {
      if (word.includes(needle)) return true;
      const tolerance = needle.length >= 8 ? 2 : needle.length >= 4 ? 1 : 0;
      return tolerance > 0 && Math.abs(word.length - needle.length) <= tolerance && editDistance(word, needle) <= tolerance;
    }),
  );
}

function toVisibleEventModel(
  events: EventItem[],
  sortBy: EventSortMode,
  userLocation: UserCoordinates | null,
  rangeStart: string | null = null,
): VisibleEventModel {
  const nonEmptyEvents = events.filter((event) => event.occurrences.length > 0);
  const sortedOccurrences = sortEventOccurrences(
    nonEmptyEvents.flatMap((event) => event.occurrences.map((occurrence) => ({ event, occurrence }))),
    sortBy,
    userLocation,
    rangeStart,
  );
  // The first date establishes one deterministic number per event. Every later
  // occurrence reuses it, and eventNumber continues beyond the 99 visible labels.
  const occurrences = numberFilteredItems(sortedOccurrences, ({ event }) => event.id)
    .map(({ item, eventNumber, displayNumber }) => ({
      ...item,
      eventNumber,
      displayNumber,
    }));
  return { events: nonEmptyEvents, occurrences };
}

function keepEvents(events: EventItem[], predicate: (event: EventItem) => boolean): EventItem[] {
  return events.filter(predicate);
}

function keepOccurrences(events: EventItem[], predicate: (occurrence: OccurrenceItem, event: EventItem) => boolean): EventItem[] {
  return events
    .map((event) => ({
      ...event,
      occurrences: event.occurrences.filter((occurrence) => predicate(occurrence, event)),
    }))
    .filter((event) => event.occurrences.length > 0);
}

function buildFilterPipeline(
  events: EventItem[],
  filters: {
    favoritesOnly: boolean;
    freeOnly: boolean;
    selectedCategories: string[];
    searchQuery: string;
    dateFilter: DateFilter;
    selectedDate: string;
    selectedEndDate: string;
    showLongRunning: boolean;
    sortBy: EventSortMode;
    userLocation: UserCoordinates | null;
    today: string;
  },
): FilterPipeline {
  // Every surface consumes this one narrowing pipeline. The calendar uses the
  // beforeDate snapshot so it can show all event-day dots; feed, map, and
  // location views use the final visible model.
  let current = events.map((event) => ({ ...event, occurrences: [...event.occurrences] }));

  // Hides are local, durable user choices and always narrow every view first.
  current = keepEvents(current, (event) => !event.is_hidden);
  current = keepEvents(current, (event) => !filters.favoritesOnly || event.is_favorite);
  current = keepEvents(current, (event) => !filters.freeOnly || event.is_free);
  current = keepEvents(current, (event) => (
    filters.selectedCategories.length === 0 || filters.selectedCategories.includes(event.category)
  ));
  current = keepEvents(current, (event) => fuzzyEventMatch(event, filters.searchQuery));
  current = keepOccurrences(current, (occurrence) => (
    filters.showLongRunning || !isLongRunningOccurrence(occurrence)
  ));

  const beforeDate = toVisibleEventModel(current, filters.sortBy, filters.userLocation);
  const dateRange = dateRangeForSelection(
    { type: filters.dateFilter, date: filters.selectedDate, endDate: filters.selectedEndDate || null },
    filters.today,
  );
  current = keepOccurrences(current, (occurrence) => occurrenceOverlapsDateRange(occurrence, dateRange));

  return {
    beforeDate,
    visible: toVisibleEventModel(current, filters.sortBy, filters.userLocation, dateRange.startDate),
  };
}

function canonicalExternalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value;
  }
}

function urlsMatch(first: string | null, second: string): boolean {
  if (!first) return false;
  return canonicalExternalUrl(first) === canonicalExternalUrl(second);
}

function mapsDirectionsUrl(event: EventItem): string | null {
  const venue = event.venue.trim();
  const address = event.address.trim();
  if (!venue && !address) return null;

  const destination = venue && address && !locationNameIsAddress(venue, address)
    ? `${venue}, ${address}`
    : address || venue;

  return googleMapsDirectionsUrl(destination);
}

const ADDRESS_SUFFIXES: Array<[RegExp, string]> = [
  [/\bStreet\b/gi, "St"],
  [/\bAvenue\b/gi, "Ave"],
  [/\bBoulevard\b/gi, "Blvd"],
  [/\bRoad\b/gi, "Rd"],
  [/\bDrive\b/gi, "Dr"],
  [/\bLane\b/gi, "Ln"],
  [/\bPlace\b/gi, "Pl"],
  [/\bCourt\b/gi, "Ct"],
  [/\bParkway\b/gi, "Pkwy"],
  [/\bHighway\b/gi, "Hwy"],
  [/\bSquare\b/gi, "Sq"],
  [/\bTerrace\b/gi, "Ter"],
  [/\bTrail\b/gi, "Trl"],
];

function formatDisplayAddress(value: string): string {
  let formatted = value.trim().replace(/\s+/g, " ");
  for (const [pattern, replacement] of ADDRESS_SUFFIXES) formatted = formatted.replace(pattern, replacement);
  // The state is redundant when the city and ZIP already identify the address.
  formatted = formatted.replace(/,\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/g, " $2");
  return formatted;
}

function locationNameIsAddress(locationName: string, address: string): boolean {
  const normalizedName = normalizeSearch(formatDisplayAddress(locationName));
  const normalizedAddress = normalizeSearch(formatDisplayAddress(address));
  return Boolean(normalizedName) && (
    normalizedAddress === normalizedName
    || normalizedAddress.startsWith(`${normalizedName} `)
    || normalizedName.startsWith(`${normalizedAddress} `)
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="link-icon">
      <path d="M7 4H4.8A1.8 1.8 0 0 0 3 5.8v9.4A1.8 1.8 0 0 0 4.8 17h9.4a1.8 1.8 0 0 0 1.8-1.8V13M10 3h7v7M17 3l-8 8" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <path d="m12.5 4.5-5.5 5.5 5.5 5.5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="verified-icon">
      <path d="m10 2 2 1.3 2.4-.1.8 2.3 2 1.4-.8 2.3.8 2.3-2 1.4-.8 2.3-2.4-.1-2 1.3-2-1.3-2.4.1-.8-2.3-2-1.4.8-2.3-.8-2.3 2-1.4.8-2.3 2.4.1L10 2Z" />
      <path d="m6.9 10 2 2 4.2-4.2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <circle cx="8.5" cy="8.5" r="5.3" /><path d="m12.5 12.5 4 4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <path d="M3 5h14M5.5 10h9M8 15h4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="control-icon">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.73v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.73l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M6.5 2.8v3.4M13.5 2.8v3.4M3 8h14" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <path d="m3 5 4-2 6 2 4-2v12l-4 2-6-2-4 2V5Z" />
      <path d="M7 3v12M13 5v12" />
    </svg>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <path
        className={filled ? "heart-fill" : ""}
        d="M10 17.1 3.2 10.5C.6 8 .9 4.4 3.7 3.1c2-.9 4.4-.3 5.7 1.4l.6.8.6-.8c1.3-1.7 3.7-2.3 5.7-1.4 2.8 1.3 3.1 4.9.5 7.4L10 17.1Z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <path d="M3.5 5.5h13M8 3.5h4M6 5.5l.7 11h6.6l.7-11M8.4 8.3v5.3M11.6 8.3v5.3" />
    </svg>
  );
}

function LongRunningIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <path d="M3.5 10h13" />
      <path d="m6.5 7-3 3 3 3M13.5 7l3 3-3 3" />
    </svg>
  );
}

function FreeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      <circle cx="10" cy="10" r="7" />
      <path d="M12.5 7.6c-.6-.5-1.4-.8-2.4-.8-1.3 0-2.2.6-2.2 1.5 0 2.2 4.6 1 4.6 3.5 0 .9-.9 1.5-2.3 1.5-1.1 0-2-.3-2.7-.9M10 5.6v8.8" />
    </svg>
  );
}

function EventActionButtons({ event, onHide }: {
  event: EventItem;
  onHide: (event: EventItem) => void;
}) {
  const sourceDuplicatesOfficial = urlsMatch(event.official_url, event.source_url);
  const directionsUrl = mapsDirectionsUrl(event);
  return (
    <div className="event-action-buttons">
      <div className="event-action-links">
        {event.official_url && (
          <a href={event.official_url} target="_blank" rel="noreferrer">
            Event site <ExternalIcon />
          </a>
        )}
        {!sourceDuplicatesOfficial && (
          <a href={event.source_url} target="_blank" rel="noreferrer">
            Original post <ExternalIcon />
          </a>
        )}
        {directionsUrl && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Get directions to ${event.venue || event.address} in Google Maps`}
          >
            Route <ExternalIcon />
          </a>
        )}
      </div>
      <StyledButton
        type="button"
        className="event-hide-button"
        onClick={() => onHide(event)}
        aria-label={`Hide ${event.title}`}
        title="Hide event"
      >
        <TrashIcon />
      </StyledButton>
    </div>
  );
}


function EventCard({
  event,
  location,
  badgeOccurrence,
  displayNumber,
  lead = false,
  ended = false,
  onToggleFavorite,
  onHide,
  canOpenLocation,
  onOpenLocation,
  selectedOnMap = false,
  onSelectMap,
  showIgMentionCount = false,
}: {
  event: EventItem;
  location: LocationItem | undefined;
  badgeOccurrence: OccurrenceItem;
  displayNumber: number | null;
  lead?: boolean;
  ended?: boolean;
  onToggleFavorite: (event: EventItem) => void;
  onHide: (event: EventItem) => void;
  canOpenLocation: boolean;
  onOpenLocation: (locationId: string) => void;
  selectedOnMap?: boolean;
  onSelectMap?: () => void;
  showIgMentionCount?: boolean;
}) {
  const hasImage = hasEventImage(event);
  const additionalDateGroups = groupedAdditionalDates(event, badgeOccurrence);
  const locationName = location?.name ?? event.venue;
  const displayAddress = formatDisplayAddress(event.address);
  const hasDistinctLocationName = !locationNameIsAddress(locationName, displayAddress);
  return (
    <article
      className={`event-card ${lead ? "event-card-lead" : ""} ${ended ? "is-ended" : ""} ${hasImage ? "has-image" : "has-placeholder"} show-date-badge ${selectedOnMap ? "explore-selected" : ""}`}
      onClick={(clickEvent) => {
        if ((clickEvent.target as HTMLElement).closest("a, button, input, textarea, select")) return;
        onSelectMap?.();
      }}
      onKeyDown={(keyEvent) => {
        if (!onSelectMap || (keyEvent.key !== "Enter" && keyEvent.key !== " ")) return;
        keyEvent.preventDefault();
        onSelectMap();
      }}
      role={onSelectMap ? "button" : undefined}
      tabIndex={onSelectMap ? 0 : undefined}
      aria-pressed={onSelectMap ? selectedOnMap : undefined}
      aria-label={onSelectMap ? `Show ${event.title} on the explore map` : undefined}
    >
      <div className={`event-image-wrap ${additionalDateGroups.length > 0 ? "has-other-dates" : ""}`}>
        <EventImage
          event={event}
          className="event-image"
          eager={lead}
        />
        <span className="event-image-shade" aria-hidden="true" />
        <div className="event-date-stack is-overlay">
          <div className="event-date-badge">
            <strong className="event-date-main">{occurrenceDateRange(badgeOccurrence)}</strong>
            <span className="event-date-time">{badgeOccurrence.times_text}</span>
            {additionalDateGroups.length > 0 && (
              <span className="additional-dates" aria-label="Other event dates">
                {additionalDateGroups.map((group) => (
                  <span className="additional-date-row" key={group.key}>{group.text}</span>
                ))}
              </span>
            )}
          </div>
        </div>
        <IconButton
          className={`favorite-button ${event.is_favorite ? "is-favorite" : ""}`}
          onClick={() => onToggleFavorite(event)}
          aria-label={event.is_favorite ? `Remove ${event.title} from favorites` : `Add ${event.title} to favorites`}
          aria-pressed={event.is_favorite}
        >
          <HeartIcon filled={event.is_favorite} />
        </IconButton>
        {shouldShowIgMentionCounter(showIgMentionCount, event.ig_mention_count) && (
          <span
            className="ig-mention-counter event-header-ig-mentions"
            aria-label={`${event.ig_mention_count} Instagram mention${event.ig_mention_count === 1 ? "" : "s"}`}
          >
            {igMentionCounterLabel(event.ig_mention_count)}
          </span>
        )}
      </div>
      <div className="event-body">
        <div className="event-heading-row">
          <div className="event-title-stack">
            <h2>{displayNumber !== null ? `${displayNumber}. ` : ""}{event.title}</h2>
            {ended && (
              <div className="event-kickers" aria-label="Event status">
                <span className="ended-badge">Ended</span>
              </div>
            )}
          </div>
        </div>
        <p className="event-description">{event.description}</p>
        <div className="event-place">
          {hasDistinctLocationName && (canOpenLocation ? (
            <StyledButton
              type="button"
              className="location-link"
              onClick={() => onOpenLocation(event.location_id)}
              aria-label={`View events at ${locationName}`}
            >
              {locationName}
            </StyledButton>
          ) : (
            <div className="location-name">{locationName}</div>
          ))}
          <span className="event-address">{displayAddress}</span>
        </div>
        {!event.is_free && event.price_text && <p className="price-text">{event.price_text}</p>}
        <EventActionButtons event={event} onHide={onHide} />
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <section className="empty-state">
      <div className="empty-date" aria-hidden="true">
        <span>NYC</span><strong>↗</strong>
      </div>
      <div>
        <p className="section-label">The list is warming up</p>
        <h1>Your next NYC finds will land here.</h1>
        <p>Fresh events arrive automatically after the daily sync.</p>
      </div>
    </section>
  );
}

const OPTION_A_TRAY_POSITIONS: readonly TraySnapDefinition[] = Object.freeze([
  { id: "middle", viewportFraction: 0.35 },
]);

// Every map-and-events experience uses these same detents, including the
// portal shown after any option enters fullscreen. Keeping the configuration
// here means fullscreen behavior cannot drift between Options A, B, and C.
const MAP_EVENT_TRAY_POSITIONS: readonly TraySnapDefinition[] = Object.freeze([
  { id: "middle", viewportFraction: 0.4 },
  { id: "full", viewportFraction: 0.95 },
]);

function trayViewportHeight() {
  if (typeof window === "undefined") return 800;
  return window.visualViewport?.height ?? window.innerHeight;
}

type ModalTrayController = {
  revealBelowViewportBoundary: (boundaryY: number) => void;
};

function ModalTray({
  children,
  ariaLabel,
  className = "",
  initialPosition = "middle",
  positions = DEFAULT_TRAY_POSITIONS,
  elementRef,
  contentScrollRef,
  controllerRef,
  onPositionChange,
}: {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  initialPosition?: TrayPosition;
  positions?: readonly TraySnapDefinition[];
  elementRef?: RefObject<HTMLElement | null>;
  contentScrollRef?: RefObject<HTMLElement | null>;
  controllerRef?: RefObject<ModalTrayController | null>;
  onPositionChange?: (position: TrayPosition) => void;
}) {
  const trayRef = useRef<HTMLElement | null>(null);
  const movable = trayIsMovable(positions);
  const initialSnaps = traySnapPoints(trayViewportHeight(), positions);
  // Keep detents anchored to the pre-keyboard viewport. Focusing a search
  // input shrinks visualViewport on mobile; adopting that temporary height
  // made a 95% tray visibly drop while the query and results were changing.
  const viewportHeightRef = useRef(trayViewportHeight());
  const [heightPx, setHeightPx] = useState(traySnapHeight(initialSnaps, initialPosition));
  const heightRef = useRef(heightPx);
  const [position, setPosition] = useState<TrayPosition>(initialPosition);
  const positionRef = useRef(position);
  const [dragging, setDragging] = useState(false);
  const animationFrame = useRef<number | null>(null);
  const trayDidDrag = useRef(false);
  const suppressContentClick = useRef(false);
  const trayDrag = useRef<{
    pointerId: number;
    startY: number;
    startHeightPx: number;
    lastY: number;
    lastTime: number;
    velocityPxPerMs: number;
    ownedGeometry: OwnedTrayDrag;
  } | null>(null);

  const setHeight = useCallback((nextHeight: number) => {
    heightRef.current = nextHeight;
    setHeightPx(nextHeight);
  }, []);

  const cancelAnimation = useCallback(() => {
    if (animationFrame.current !== null) {
      window.cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
  }, []);

  const animateToHeight = useCallback((target: number, initialVelocityPxPerMs = 0) => {
    cancelAnimation();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setHeight(target);
      return;
    }

    let value = heightRef.current;
    let velocity = initialVelocityPxPerMs * 1000;
    let previousTime = performance.now();
    const stiffness = 420;
    const damping = 38;

    const step = (time: number) => {
      const elapsed = Math.min((time - previousTime) / 1000, 0.032);
      previousTime = time;
      const acceleration = stiffness * (target - value) - damping * velocity;
      velocity += acceleration * elapsed;
      value += velocity * elapsed;
      setHeight(value);
      if (Math.abs(target - value) <= 0.35 && Math.abs(velocity) <= 3) {
        setHeight(target);
        animationFrame.current = null;
        return;
      }
      animationFrame.current = window.requestAnimationFrame(step);
    };
    animationFrame.current = window.requestAnimationFrame(step);
  }, [cancelAnimation, setHeight]);

  const settleAt = useCallback((nextPosition: TrayPosition, initialVelocityPxPerMs = 0) => {
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    const snaps = traySnapPoints(viewportHeightRef.current, positions);
    animateToHeight(traySnapHeight(snaps, nextPosition), initialVelocityPxPerMs);
  }, [animateToHeight, positions]);

  useImperativeHandle(controllerRef, () => ({
    revealBelowViewportBoundary(boundaryY: number) {
      const snaps = traySnapPoints(viewportHeightRef.current, positions);
      const target = trayHeightBelowViewportBoundary(
        viewportHeightRef.current,
        boundaryY,
        heightRef.current,
        snaps,
      );
      if (target > heightRef.current + 0.5) animateToHeight(target);
    },
  }), [animateToHeight, positions]);

  useEffect(() => {
    onPositionChange?.(position);
  }, [onPositionChange, position]);

  useEffect(() => {
    const onResize = () => {
      const nextViewportHeight = trayViewportHeight();
      const activeElement = document.activeElement;
      const textEntryHasFocus = activeElement instanceof HTMLInputElement
        || activeElement instanceof HTMLTextAreaElement
        || (activeElement instanceof HTMLElement && activeElement.isContentEditable);

      // Opening the software keyboard is a visual-viewport resize, not a new
      // tray layout. Retain the pre-focus height so filtering never pushes the
      // cards down and out of the visible result area.
      if (!shouldAdoptTrayViewportHeight(
        viewportHeightRef.current,
        nextViewportHeight,
        textEntryHasFocus,
      )) return;
      viewportHeightRef.current = nextViewportHeight;
      settleAt(positionRef.current);
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      cancelAnimation();
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [cancelAnimation, settleAt]);

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    cancelAnimation();
    event.currentTarget.setPointerCapture(event.pointerId);
    trayDrag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeightPx: heightRef.current,
      lastY: event.clientY,
      lastTime: performance.now(),
      velocityPxPerMs: 0,
      ownedGeometry: beginOwnedTrayDrag(heightRef.current, event.clientY),
    };
    trayDidDrag.current = false;
    setDragging(true);
  };

  const moveTray = (event: React.PointerEvent<HTMLElement>) => {
    const drag = trayDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(now - drag.lastTime, 1);
    const instantaneousVelocity = (drag.lastY - event.clientY) / elapsed;
    drag.velocityPxPerMs = drag.velocityPxPerMs * 0.65 + instantaneousVelocity * 0.35;
    drag.lastY = event.clientY;
    drag.lastTime = now;
    const delta = drag.startY - event.clientY;
    if (Math.abs(delta) > 4) trayDidDrag.current = true;
    // Pointer motion owns the tray height for the entire drag. Geometry is
    // always derived from the original pointer-down anchor, so the result is
    // independent of event frequency and continues correctly after reversal.
    drag.ownedGeometry = moveOwnedTrayDrag(
      drag.ownedGeometry,
      event.clientY,
      traySnapPoints(viewportHeightRef.current, positions),
    );
    setHeight(drag.ownedGeometry.currentHeight);
  };

  const settleReleasedDrag = useCallback((
    drag: { velocityPxPerMs: number; heightAtRelease?: number },
    suppressClick: boolean,
  ) => {
    setDragging(false);
    if (!trayDidDrag.current) return;
    if (suppressClick) suppressContentClick.current = true;
    const snaps = traySnapPoints(viewportHeightRef.current, positions);
    // Use the gesture's owned geometry when available. React rendering and
    // native scroll cancellation can lag the final movement event; reading a
    // rendered/ref height here truncated the pull and snapped 95% back to 95%.
    const heightAtRelease = drag.heightAtRelease ?? heightRef.current;
    setHeight(heightAtRelease);
    const nextPosition = releaseTrayPosition(heightAtRelease, drag.velocityPxPerMs, snaps);
    settleAt(nextPosition, drag.velocityPxPerMs);
    if (suppressClick) {
      window.setTimeout(() => {
        suppressContentClick.current = false;
      }, 350);
    }
  }, [positions, setHeight, settleAt]);

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const drag = trayDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    trayDrag.current = null;
    settleReleasedDrag({
      velocityPxPerMs: drag.velocityPxPerMs,
      heightAtRelease: drag.ownedGeometry.currentHeight,
    }, false);
  };

  const cancelDrag = (event: React.PointerEvent<HTMLElement>) => {
    trayDrag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    const scrollElement = contentScrollRef?.current;
    if (!movable || !scrollElement) return;

    const snaps = () => traySnapPoints(viewportHeightRef.current, positions);
    const activationDistance = 8;

    // Touch sequences stay targeted at the element where they began. We use
    // that lifecycle on iOS instead of trying to acquire pointer capture after
    // WebKit has already started rubber-band scrolling. Crucially, the very
    // first downward movement at the top is prevented—even while it is still
    // inside the direction threshold—so native overscroll never gets a chance
    // to cancel the later sheet takeover.
    let touchGesture: { touchId: number; state: TrayContentGesture } | null = null;
    const touchById = (touches: TouchList, id: number) => {
      for (let index = 0; index < touches.length; index += 1) {
        const touch = touches.item(index);
        if (touch?.identifier === id) return touch;
      }
      return null;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        touchGesture = null;
        return;
      }
      const touch = event.touches.item(0);
      if (!touch) return;
      touchGesture = {
        touchId: touch.identifier,
        state: beginTrayContentGesture(heightRef.current, touch.clientY, event.timeStamp),
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!touchGesture) return;
      const touch = touchById(event.touches, touchGesture.touchId);
      if (!touch) return;
      const previous = touchGesture.state;
      const totalFingerDelta = touch.clientY - previous.startPointerY;

      // Suppress iOS rubber-band from the first downward pixel at the tolerant
      // top boundary. Waiting for the 8px mode threshold lets WebKit commit the
      // gesture first, which produces pointercancel after one visible frame.
      if (totalFingerDelta > 0 && isScrollAtTop(scrollElement.scrollTop) && event.cancelable) {
        event.preventDefault();
      }

      const next = advanceTrayContentGesture(
        previous,
        touch.clientY,
        event.timeStamp,
        scrollElement.scrollTop,
        snaps(),
        activationDistance,
      );
      touchGesture.state = next;

      if (previous.mode !== "sheet" && next.mode === "sheet") {
        cancelAnimation();
        trayDidDrag.current = false;
        // Neutralize any fractional/negative rubber-band offset before the
        // sheet owns geometry. The content and sheet must not move together.
        scrollElement.scrollTop = 0;
        setDragging(true);
      }
      if (next.mode !== "sheet" || !next.sheetDrag) return;
      if (event.cancelable) event.preventDefault();
      if (Math.abs(next.sheetDrag.currentHeight - next.sheetDrag.startHeight) > 4) {
        trayDidDrag.current = true;
      }
      setHeight(next.sheetDrag.currentHeight);
    };

    const releaseTouch = (event: TouchEvent) => {
      if (!touchGesture || !touchById(event.changedTouches, touchGesture.touchId)) return;
      const released = releaseTrayContentGesture(touchGesture.state, snaps());
      touchGesture = null;
      if (!released) return;
      settleReleasedDrag(released, true);
    };

    // Pen input has no native rubber-band handoff problem, but keeping the
    // same pure gesture state machine makes release geometry identical. Touch
    // pointer events are deliberately ignored; the touch stream above owns
    // those gestures from start through release without late capture.
    let pointerGesture: { pointerId: number; state: TrayContentGesture } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "pen" || !event.isPrimary) return;
      pointerGesture = {
        pointerId: event.pointerId,
        state: beginTrayContentGesture(heightRef.current, event.clientY, event.timeStamp),
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return;
      const previous = pointerGesture.state;
      const next = advanceTrayContentGesture(
        previous,
        event.clientY,
        event.timeStamp,
        scrollElement.scrollTop,
        snaps(),
        activationDistance,
      );
      pointerGesture.state = next;
      if (previous.mode !== "sheet" && next.mode === "sheet") {
        cancelAnimation();
        trayDidDrag.current = false;
        scrollElement.setPointerCapture(event.pointerId);
        setDragging(true);
      }
      if (next.mode !== "sheet" || !next.sheetDrag) return;
      if (event.cancelable) event.preventDefault();
      if (Math.abs(next.sheetDrag.currentHeight - next.sheetDrag.startHeight) > 4) {
        trayDidDrag.current = true;
      }
      setHeight(next.sheetDrag.currentHeight);
    };
    const releasePointer = (event: PointerEvent) => {
      if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return;
      const released = releaseTrayContentGesture(pointerGesture.state, snaps());
      pointerGesture = null;
      if (scrollElement.hasPointerCapture(event.pointerId)) {
        scrollElement.releasePointerCapture(event.pointerId);
      }
      if (!released) return;
      settleReleasedDrag(released, true);
    };

    scrollElement.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollElement.addEventListener("touchmove", onTouchMove, { passive: false });
    scrollElement.addEventListener("touchend", releaseTouch);
    scrollElement.addEventListener("touchcancel", releaseTouch);
    scrollElement.addEventListener("pointerdown", onPointerDown);
    scrollElement.addEventListener("pointermove", onPointerMove, { passive: false });
    scrollElement.addEventListener("pointerup", releasePointer);
    scrollElement.addEventListener("pointercancel", releasePointer);
    return () => {
      scrollElement.removeEventListener("touchstart", onTouchStart);
      scrollElement.removeEventListener("touchmove", onTouchMove);
      scrollElement.removeEventListener("touchend", releaseTouch);
      scrollElement.removeEventListener("touchcancel", releaseTouch);
      scrollElement.removeEventListener("pointerdown", onPointerDown);
      scrollElement.removeEventListener("pointermove", onPointerMove);
      scrollElement.removeEventListener("pointerup", releasePointer);
      scrollElement.removeEventListener("pointercancel", releasePointer);
    };
  }, [cancelAnimation, contentScrollRef, movable, positions, setHeight, settleReleasedDrag]);

  const cyclePosition = () => {
    if (trayDidDrag.current) {
      trayDidDrag.current = false;
      return;
    }
    const snaps = traySnapPoints(viewportHeightRef.current, positions);
    const current = nearestTrayPosition(heightRef.current, snaps);
    const currentIndex = snaps.findIndex((snap) => snap.id === current);
    settleAt(snaps[(currentIndex + 1) % snaps.length]!.id);
  };

  const moveOnePosition = (direction: "up" | "down") => {
    const snaps = traySnapPoints(viewportHeightRef.current, positions);
    const current = nearestTrayPosition(heightRef.current, snaps);
    settleAt(adjacentTrayPosition(current, direction, snaps));
  };

  return (
    <aside
      ref={(node) => {
        trayRef.current = node;
        if (elementRef) elementRef.current = node;
      }}
      className={`modal-tray ${dragging ? "is-dragging" : ""} ${heightPx >= viewportHeightRef.current - 0.5 ? "is-viewport-full" : ""} ${className}`}
      style={{ height: `${heightPx}px` }}
      aria-label={ariaLabel}
      data-tray-position={position}
    >
      <div className="modal-tray-surface">
        <div
          className="modal-tray-content"
          onClickCapture={(event) => {
            if (!suppressContentClick.current) return;
            suppressContentClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {children}
        </div>
        {movable && (
          <StyledButton
            type="button"
            className="modal-tray-handle"
            aria-label={`Tray is ${position}; drag or press to move to the next position`}
            onPointerDown={startDrag}
            onPointerMove={moveTray}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
            onClick={cyclePosition}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveOnePosition("up");
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveOnePosition("down");
              }
              if (event.key === "Home") {
                event.preventDefault();
                settleAt(traySnapPoints(viewportHeightRef.current, positions)[0]!.id);
              }
              if (event.key === "End") {
                event.preventDefault();
                settleAt(traySnapPoints(viewportHeightRef.current, positions).at(-1)!.id);
              }
            }}
          >
            <span aria-hidden="true" />
          </StyledButton>
        )}
      </div>
    </aside>
  );
}

/**
 * Keeps scroll-driven selection from fighting a marker-triggered smooth scroll.
 * The lock deliberately lives outside the selection observer effects, so changing
 * the selected occurrence cannot tear it down midway through an auto-scroll.
 */
function useProgrammaticScrollGuard() {
  const locked = useRef(false);
  const releaseTimer = useRef<number | null>(null);

  const cancelRelease = useCallback(() => {
    if (releaseTimer.current !== null) {
      window.clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
    }
  }, []);

  const releaseAfter = useCallback((delay: number) => {
    cancelRelease();
    releaseTimer.current = window.setTimeout(() => {
      locked.current = false;
      releaseTimer.current = null;
    }, delay);
  }, [cancelRelease]);

  const beginProgrammaticScroll = useCallback(() => {
    locked.current = true;
    // Fallback for browsers that do not emit scroll events when the target is
    // already visible. Actual scroll events keep extending the shorter timer.
    releaseAfter(800);
  }, [releaseAfter]);

  const holdProgrammaticScroll = useCallback(() => {
    if (locked.current) releaseAfter(220);
  }, [releaseAfter]);

  const allowUserScrollSelection = useCallback(() => {
    locked.current = false;
    cancelRelease();
  }, [cancelRelease]);

  const isProgrammaticScroll = useCallback(() => locked.current, []);

  useEffect(() => () => {
    cancelRelease();
    locked.current = false;
  }, [cancelRelease]);

  return {
    beginProgrammaticScroll,
    holdProgrammaticScroll,
    allowUserScrollSelection,
    isProgrammaticScroll,
  };
}

let hasPlayedFeedMapButtonBounce = false;

function FeedView({ occurrences, locations, locationEventCounts, today, showIgMentionCount, selectedOccurrenceId, onSelectOccurrence, onToggleFavorite, onHide, onOpenLocation }: {
  occurrences: EventOccurrence[];
  locations: LocationMap;
  locationEventCounts: LocationEventCounts;
  today: string;
  showIgMentionCount: boolean;
  selectedOccurrenceId: string | null;
  onSelectOccurrence: (occurrenceId: string) => void;
  onToggleFavorite: (event: EventItem) => void;
  onHide: (event: EventItem) => void;
  onOpenLocation: (locationId: string) => void;
}) {
  const [mapVisible, setMapVisible] = useState(false);
  const mapTransition = usePresenceTransition(mapVisible, {
    exitAnimationName: "ui-slide-from-bottom-exit",
    exitDurationMs: 380,
  });
  const mapPresented = mapTransition.mounted;
  const [shouldBounceMapButton] = useState(() => {
    if (hasPlayedFeedMapButtonBounce) return false;
    hasPlayedFeedMapButtonBounce = true;
    return true;
  });
  const fullscreen = useMapFullscreen();
  const cardInstances = useRef(new Map<string, HTMLElement>());
  const trayInstance = useRef<HTMLDivElement | null>(null);
  const frameSelectedControl = useRef<FrameEventOnMap | null>(null);
  const selectedOccurrenceIdRef = useRef(selectedOccurrenceId);
  selectedOccurrenceIdRef.current = selectedOccurrenceId;
  const {
    beginProgrammaticScroll,
    holdProgrammaticScroll,
    allowUserScrollSelection,
    isProgrammaticScroll,
  } = useProgrammaticScrollGuard();
  const selectedItem = occurrences.find(({ occurrence }) => occurrence.id === selectedOccurrenceId) ?? occurrences[0] ?? null;

  useEffect(() => {
    let frame: number | null = null;

    const selectMostVisibleCard = () => {
      frame = null;
      const visualViewport = window.visualViewport;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const naturalViewportBottom = viewportTop + viewportHeight;
      const trayElement = mapPresented ? trayInstance.current?.querySelector<HTMLElement>(".feed-map-tray") : null;
      const trayTop = trayElement?.getBoundingClientRect().top;
      const viewportBottom = Math.max(viewportTop, Math.min(naturalViewportBottom, trayTop ?? naturalViewportBottom));
      const viewportCenter = (viewportTop + viewportBottom) / 2;
      let bestId: string | null = null;
      let bestVisibleHeight = 0;
      let bestCenterDistance = Number.POSITIVE_INFINITY;

      for (const { occurrence } of occurrences) {
        const card = cardInstances.current.get(occurrence.id);
        if (!card) continue;
        const bounds = card.getBoundingClientRect();
        const visibleHeight = Math.max(
          0,
          Math.min(bounds.bottom, viewportBottom) - Math.max(bounds.top, viewportTop),
        );
        const centerDistance = Math.abs((bounds.top + bounds.bottom) / 2 - viewportCenter);

        if (
          visibleHeight > bestVisibleHeight ||
          (visibleHeight === bestVisibleHeight && visibleHeight > 0 && centerDistance < bestCenterDistance)
        ) {
          bestId = occurrence.id;
          bestVisibleHeight = visibleHeight;
          bestCenterDistance = centerDistance;
        }
      }

      if (bestId && bestId !== selectedOccurrenceIdRef.current) {
        selectedOccurrenceIdRef.current = bestId;
        onSelectOccurrence(bestId);
      }
    };

    const scheduleSelection = () => {
      if (isProgrammaticScroll()) {
        // Smooth scrolls emit the same events as touch scrolling. Keep the marker
        // that initiated the motion selected until the programmatic scroll settles.
        holdProgrammaticScroll();
        return;
      }
      if (frame !== null) return;
      frame = window.requestAnimationFrame(selectMostVisibleCard);
    };
    const onUserScrollKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        allowUserScrollSelection();
      }
    };

    // Muse can scroll the document or an embedding scroll container. Scroll events do
    // not bubble, so observe them during capture instead of relying on window alone.
    document.addEventListener("scroll", scheduleSelection, { capture: true, passive: true });
    window.addEventListener("scroll", scheduleSelection, { passive: true });
    window.addEventListener("resize", scheduleSelection);
    window.visualViewport?.addEventListener("scroll", scheduleSelection, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleSelection);
    document.addEventListener("pointerdown", allowUserScrollSelection, true);
    document.addEventListener("touchstart", allowUserScrollSelection, { capture: true, passive: true });
    document.addEventListener("wheel", allowUserScrollSelection, { capture: true, passive: true });
    document.addEventListener("keydown", onUserScrollKeyDown, true);

    // IntersectionObserver is the second signal: it fires as cards move through the
    // viewport even when the scrolling element belongs to the host webview.
    const intersectionObserver = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(scheduleSelection, {
          root: null,
          threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
        });
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSelection);
    for (const card of cardInstances.current.values()) {
      intersectionObserver?.observe(card);
      resizeObserver?.observe(card);
    }
    const trayElement = trayInstance.current?.querySelector<HTMLElement>(".feed-map-tray");
    if (trayElement) resizeObserver?.observe(trayElement);
    scheduleSelection();

    return () => {
      document.removeEventListener("scroll", scheduleSelection, true);
      window.removeEventListener("scroll", scheduleSelection);
      window.removeEventListener("resize", scheduleSelection);
      window.visualViewport?.removeEventListener("scroll", scheduleSelection);
      window.visualViewport?.removeEventListener("resize", scheduleSelection);
      document.removeEventListener("pointerdown", allowUserScrollSelection, true);
      document.removeEventListener("touchstart", allowUserScrollSelection, true);
      document.removeEventListener("wheel", allowUserScrollSelection, true);
      document.removeEventListener("keydown", onUserScrollKeyDown, true);
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [mapPresented, occurrences, onSelectOccurrence, allowUserScrollSelection, holdProgrammaticScroll, isProgrammaticScroll]);

  const selectFromMap = (occurrenceId: string) => {
    beginProgrammaticScroll();
    selectedOccurrenceIdRef.current = occurrenceId;
    onSelectOccurrence(occurrenceId);
    window.requestAnimationFrame(() => {
      cardInstances.current.get(occurrenceId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <section className={`feed-with-map-tray ${mapPresented ? "is-map-visible" : ""}`} aria-label="Event feed">
      {occurrences.length === 0 ? (
        <div className="no-results">
          <h2>No matches in this view.</h2>
          <p>Try another date range or category, switch the price filter, or turn off Favs.</p>
        </div>
      ) : (
        <>
          <div className="feed-list">
            {occurrences.map(({ event, occurrence, displayNumber }, index) => {
              const selected = occurrence.id === selectedItem?.occurrence.id;
              return (
                <div
                  className="feed-card-anchor"
                  key={`${event.id}:${occurrence.id}`}
                  ref={(node) => {
                    if (node) cardInstances.current.set(occurrence.id, node);
                    else cardInstances.current.delete(occurrence.id);
                  }}
                >
                  <EventCard
                    event={event}
                    location={locations.get(event.location_id)}
                    badgeOccurrence={occurrence}
                    displayNumber={displayNumber}
                    lead={index === 0}
                    ended={occurrenceEnd(occurrence) < today}
                    onToggleFavorite={onToggleFavorite}
                    onHide={onHide}
                    canOpenLocation={(locationEventCounts.get(event.location_id) ?? 0) > 1}
                    onOpenLocation={onOpenLocation}
                    selectedOnMap={mapPresented && selected}
                    onSelectMap={() => {
                      if (event.lat !== null && event.lng !== null) {
                        selectAndFrameEvent({
                          eventId: event.id,
                          occurrenceId: occurrence.id,
                          onSelectOccurrence,
                          onFrameEvent: (eventId) => {
                            frameSelectedControl.current?.(eventId, OPTION_B_MINIMAP_ZOOM);
                          },
                        });
                        return;
                      }
                      onSelectOccurrence(occurrence.id);
                    }}
                    showIgMentionCount={showIgMentionCount}
                  />
                </div>
              );
            })}
          </div>
          {mapPresented && (
            <div
              ref={trayInstance}
              className="feed-tray-layer"
              onAnimationEnd={mapTransition.onAnimationEnd}
            >
              <ModalTray
                className={`feed-map-tray ui-slide-from-bottom ${mapTransition.exiting ? "is-exiting" : ""}`}
                ariaLabel="Map of events in the feed"
                positions={OPTION_A_TRAY_POSITIONS}
              >
                <FeedTrayMap
                  occurrences={occurrences}
                  fullscreenActive={fullscreen.active}
                  onToggleFullscreen={fullscreen.toggle}
                  selectedOccurrenceId={selectedItem?.occurrence.id ?? null}
                  onSelectOccurrence={selectFromMap}
                  locations={locations}
                  locationEventCounts={locationEventCounts}
                  today={today}
                  onToggleFavorite={onToggleFavorite}
                  onHide={onHide}
                  onOpenLocation={onOpenLocation}
                  frameSelectedControlRef={frameSelectedControl}
                />
              </ModalTray>
            </div>
          )}
          <StyledButton
            type="button"
            className={`feed-map-toggle ${mapPresented ? "is-open" : ""} ${shouldBounceMapButton ? "should-bounce" : ""}`}
            onClick={() => setMapVisible((visible) => !visible)}
            aria-label={mapPresented ? "Hide map" : "Show map"}
            aria-expanded={mapPresented}
          >
            <MapIcon />
          </StyledButton>
        </>
      )}
    </section>
  );
}

function DateFilterControl({
  dateFilter,
  selectedDate,
  selectedEndDate,
  occurrences,
  today,
  locateMeEnabled,
  onLocateMeEnabledChange,
  onDateFilter,
  onSelectRange,
}: {
  dateFilter: DateFilter;
  selectedDate: string;
  selectedEndDate: string;
  occurrences: EventOccurrence[];
  today: string;
  locateMeEnabled: boolean;
  onLocateMeEnabledChange: (enabled: boolean) => void;
  onDateFilter: (filter: DateFilter) => void;
  onSelectRange: (startDate: string, endDate: string | null) => void;
}) {
  const calendarSelected = dateFilter === "calendar";
  const anchor = calendarSelected ? selectedDate : today;
  const anchorDate = parseDate(anchor);
  const [month, setMonth] = useState(() => new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 12));
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [awaitingRangeEnd, setAwaitingRangeEnd] = useState(false);
  const [showLocationConsent, setShowLocationConsent] = useState(false);
  const [locationRequested, setLocationRequested] = useState(false);
  const [locationStatusMessage, setLocationStatusMessage] = useState<string | null>(null);
  const dateFilterRowRef = useAdaptiveFilterAlignment();
  const sortMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const calendarMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const sortMenuId = useId();
  const calendarMenuId = useId();
  const userLocation = useSharedUserLocation();

  useEffect(() => {
    const next = parseDate(anchor);
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1, 12));
  }, [anchor]);

  useEffect(() => {
    if (!calendarSelected) {
      setCalendarOpen(false);
      setAwaitingRangeEnd(false);
    }
  }, [calendarSelected]);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1, 12).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0, 12).getDate();
  const cells: Array<string | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => isoDate(new Date(year, monthIndex, index + 1, 12))),
  ];
  while (cells.length % 7) cells.push(null);

  const setSelection = (filter: DateFilter) => onDateFilter(filter);
  const moveMonth = (delta: number) => setMonth(new Date(year, monthIndex + delta, 1, 12));
  const chooseCalendarDay = (day: string) => {
    const next = selectCalendarRangeDay(selectedDate, awaitingRangeEnd, day);
    onSelectRange(next.range.startDate, next.range.endDate);
    setAwaitingRangeEnd(next.awaitingEnd);
  };
  const rangeSummary = selectedEndDate
    ? `${shortDate(selectedDate)} – ${shortDate(selectedEndDate)}`
    : awaitingRangeEnd
      ? `${shortDate(selectedDate)} – choose end`
      : "Tap a start date, then an end date";

  useEffect(() => {
    if (!locationRequested) return;
    if (userLocation.status === "ready") {
      setLocationStatusMessage(null);
      setLocationRequested(false);
    } else if (userLocation.status === "error") {
      if (!userLocation.position) onLocateMeEnabledChange(false);
      setLocationStatusMessage(userLocation.error);
      setLocationRequested(false);
    }
  }, [locateMeEnabled, locationRequested, onLocateMeEnabledChange, userLocation.error, userLocation.position, userLocation.status]);

  const selectSort = (mode: "popular" | "distance", closeMenu: () => void) => {
    closeMenu();
    setLocationStatusMessage(null);
    if (mode === "popular") {
      onLocateMeEnabledChange(false);
      return;
    }
    if (!userLocation.position) {
      setShowLocationConsent(true);
      return;
    }
    onLocateMeEnabledChange(true);
    setLocationRequested(true);
    refreshSharedUserLocation();
  };

  const allowLocation = () => {
    setShowLocationConsent(false);
    onLocateMeEnabledChange(true);
    setLocationRequested(true);
    setLocationStatusMessage("Finding your location…");
    refreshSharedUserLocation();
  };

  const setCalendarMenuOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCalendarOpen(false);
      setAwaitingRangeEnd(false);
      return;
    }
    if (!calendarSelected) {
      const next = activateCalendarPicker(selectedDate, selectedEndDate || null, today);
      onSelectRange(next.range.startDate, next.range.endDate);
      setAwaitingRangeEnd(next.awaitingEnd);
    }
    setCalendarOpen(true);
  };

  return (
    <div className={`date-filter-control ${calendarSelected ? "is-calendar-open" : ""}`}>
      <div ref={dateFilterRowRef} className="date-filter-selectors">
        <div className={`sort-picker ${sortMenuOpen ? "is-open" : ""}`}>
          <StyledButton
            ref={sortMenuAnchorRef}
            type="button"
            className="popup-menu-trigger"
            onClick={() => setSortMenuOpen((open) => !open)}
            aria-label={`Sort events by ${locateMeEnabled ? "proximity" : "popularity"}`}
            aria-haspopup="menu"
            aria-expanded={sortMenuOpen}
            aria-controls={sortMenuId}
          >
            {locateMeEnabled ? "Near me" : "Popular"}
            <span aria-hidden="true" />
          </StyledButton>
          <PopupMenu
            anchorRef={sortMenuAnchorRef}
            menuId={sortMenuId}
            menuClassName="sort-menu"
            open={sortMenuOpen}
            onOpenChange={setSortMenuOpen}
          >
            {({ close }) => (
              <div role="radiogroup" aria-label="Sort events">
                <StyledButton
                  type="button"
                  className={!locateMeEnabled ? "is-selected" : ""}
                  role="radio"
                  aria-checked={!locateMeEnabled}
                  onClick={() => selectSort("popular", close)}
                >
                  <span>Popular</span>
                  <span className="sort-selected-mark" aria-hidden="true">✓</span>
                </StyledButton>
                <StyledButton
                  type="button"
                  className={locateMeEnabled ? "is-selected" : ""}
                  role="radio"
                  aria-checked={locateMeEnabled}
                  disabled={locationRequested}
                  onClick={() => selectSort("distance", close)}
                >
                  <span>Near me</span>
                  <span className="sort-selected-mark" aria-hidden="true">✓</span>
                </StyledButton>
              </div>
            )}
          </PopupMenu>
        </div>
        <div className="segmented date-filter" aria-label="Date picker">
          <StyledButton className={dateFilter === "future" ? "active" : ""} onClick={() => setSelection("future")} aria-pressed={dateFilter === "future"}>Upcoming</StyledButton>
          <StyledButton className={dateFilter === "week" ? "active" : ""} onClick={() => setSelection("week")} aria-pressed={dateFilter === "week"}>Week</StyledButton>
          <StyledButton className={dateFilter === "today" ? "active" : ""} onClick={() => setSelection("today")} aria-pressed={dateFilter === "today"}>Today</StyledButton>
          <StyledButton className={dateFilter === "tomorrow" ? "active" : ""} onClick={() => setSelection("tomorrow")} aria-pressed={dateFilter === "tomorrow"}>Tmrw</StyledButton>
          <StyledButton
            ref={calendarMenuAnchorRef}
            type="button"
            className={`popup-menu-trigger calendar-choice ${calendarSelected ? "active" : ""}`}
            onClick={() => setCalendarMenuOpen(!calendarOpen)}
            aria-label={calendarSelected
              ? `Calendar selected, ${selectedEndDate ? `${shortDate(selectedDate)} through ${shortDate(selectedEndDate)}` : `starting ${shortDate(selectedDate)}`}. ${calendarOpen ? "Close" : "Open"} calendar picker`
              : "Calendar date range"}
            aria-pressed={calendarSelected}
            aria-haspopup="dialog"
            aria-expanded={calendarOpen}
            aria-controls={calendarMenuId}
          >
            <CalendarIcon />
            <span>Calendar</span>
          </StyledButton>
          <PopupMenu
            anchorRef={calendarMenuAnchorRef}
            menuId={calendarMenuId}
            menuClassName="calendar-popover"
            open={calendarOpen}
            onOpenChange={setCalendarMenuOpen}
            align="end"
            offset={6}
          >
            <section aria-label="Choose a date range">
              <div className="calendar-heading">
                <StyledButton type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">←</StyledButton>
                <div>
                  <h2>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
                  <p className="calendar-range-status" aria-live="polite">{rangeSummary}</p>
                </div>
                <StyledButton type="button" onClick={() => moveMonth(1)} aria-label="Next month">→</StyledButton>
              </div>
              <div className="calendar-grid" role="grid" aria-label={month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}>
                {WEEKDAYS.map((day) => <div className="weekday" key={day} role="columnheader">{day}</div>)}
                {cells.map((day, index) => {
                  if (!day) return <div className="calendar-blank" key={`blank-${index}`} />;
                  const count = calendarEntriesOn(occurrences, day).length;
                  const rangeStart = day === selectedDate;
                  const rangeEnd = Boolean(selectedEndDate) && day === selectedEndDate;
                  const inRange = Boolean(selectedEndDate) && day > selectedDate && day < selectedEndDate;
                  const selected = calendarSelected && (rangeStart || rangeEnd);
                  const dotTone = day < today ? "past" : "upcoming";
                  const selectionLabel = rangeStart ? ", range start" : rangeEnd ? ", range end" : inRange ? ", in selected range" : "";
                  return (
                    <StyledButton
                      type="button"
                      key={day}
                      className={`calendar-day ${selected ? "selected" : ""} ${rangeStart ? "is-range-start" : ""} ${rangeEnd ? "is-range-end" : ""} ${inRange ? "is-in-range" : ""} ${day === today ? "today" : ""}`}
                      onClick={() => chooseCalendarDay(day)}
                      aria-label={`${shortDate(day)}${count ? `, ${count} event${count === 1 ? "" : "s"}` : ", no events"}${selectionLabel}`}
                      aria-pressed={selected}
                    >
                      <span>{Number(day.slice(-2))}</span>
                      <i className={count > 0 ? `has-events is-${dotTone}` : ""} aria-hidden="true" />
                    </StyledButton>
                  );
                })}
              </div>
            </section>
          </PopupMenu>
        </div>
      </div>
      {showLocationConsent && (
        <div className="date-location-consent" role="dialog" aria-label="Save current location">
          <p>Use your device location and save it for maps on your next visit?</p>
          <div>
            <StyledButton type="button" onClick={() => setShowLocationConsent(false)}>Cancel</StyledButton>
            <StyledButton type="button" onClick={allowLocation}>Allow</StyledButton>
          </div>
        </div>
      )}
      {locationStatusMessage && !showLocationConsent && (
        <p className="date-location-status" role="status">{locationStatusMessage}</p>
      )}
    </div>
  );
}

function EventFilterBar({
  leadingControl,
  searchOnly = false,
  onSearchFocus,
  calendarOccurrencesOverride,
}: {
  leadingControl?: ReactNode;
  searchOnly?: boolean;
  onSearchFocus?: () => void;
  calendarOccurrencesOverride?: EventOccurrence[];
} = {}) {
  const {
    searchQuery,
    setSearchQuery,
    freeOnly,
    setFreeOnly,
    favoritesOnly,
    setFavoritesOnly,
    showLongRunning,
    setShowLongRunning,
    selectedCategories,
    setSelectedCategories,
    availableCategories,
    dateFilter,
    selectedDate,
    selectedEndDate,
    calendarOccurrences,
    today,
    locateMeEnabled,
    setLocateMeEnabled,
    setDateFilter,
    selectRange,
  } = useEventFilterControls();
  const [searchExpanded, setSearchExpanded] = useState(Boolean(searchQuery));
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const categoryMenuId = useId();
  const secondaryFilterRowRef = useAdaptiveFilterAlignment();

  useEffect(() => {
    // The collapsed fullscreen filter state can retain a populated search
    // without stealing focus (and reopening the software keyboard).
    if (searchExpanded && !searchOnly) searchInputRef.current?.focus();
  }, [searchExpanded, searchOnly]);

  const toggleCategory = (categoryName: string) => {
    setSelectedCategories((current) => current.includes(categoryName)
      ? current.filter((item) => item !== categoryName)
      : [...current, categoryName]);
  };

  return (
    <div className="filter-bar">
      <div ref={secondaryFilterRowRef} className="filter-secondary-row">
        {leadingControl}
        {searchExpanded ? (
          <div
            className="search-form is-expanded"
            role="search"
            onBlur={(event) => {
              if (!searchQuery && !event.currentTarget.contains(event.relatedTarget as Node | null)) setSearchExpanded(false);
            }}
          >
            <div className={`search-field ${searchQuery.trim() ? "is-filter-active" : ""}`}>
              <SearchIcon />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onFocus={onSearchFocus}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchQuery("");
                    setSearchExpanded(false);
                  }
                }}
                placeholder="Search title, location, or description"
                aria-label="Search title, location, or description"
              />
              {searchQuery && (
                <IconButton
                  className="search-clear-button"
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <CloseIcon />
                </IconButton>
              )}
            </div>
          </div>
        ) : (
          <IconButton
            className="filter-search-button"
            type="button"
            onClick={() => setSearchExpanded(true)}
            aria-label="Search events"
            title="Search"
          >
            <SearchIcon />
          </IconButton>
        )}
        {!searchOnly && (
          <>
            <ToggleButton selected={freeOnly} onClick={() => setFreeOnly((value) => !value)}>
              <FreeIcon /> Free
            </ToggleButton>
            <ToggleButton selected={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)}>
              <HeartIcon filled={favoritesOnly} /> Favs
            </ToggleButton>
            <ToggleButton selected={showLongRunning} onClick={() => setShowLongRunning((value) => !value)}>
              <LongRunningIcon /> Long
            </ToggleButton>
            <div className={`category-picker ${categoryMenuOpen ? "is-open" : ""}`}>
              <StyledButton
                ref={categoryMenuAnchorRef}
                type="button"
                className={`popup-menu-trigger ${selectedCategories.length > 0 ? "is-filter-active" : ""}`}
                onClick={() => setCategoryMenuOpen((open) => !open)}
                aria-label={selectedCategories.length > 0
                  ? `Filter by categories, ${selectedCategories.length} selected`
                  : "Filter by categories"}
                aria-haspopup="menu"
                aria-expanded={categoryMenuOpen}
                aria-controls={categoryMenuId}
              >
                <span className="category-trigger-label">Categories</span>
                {selectedCategories.length > 0 && (
                  <span className="filter-count" aria-hidden="true">{selectedCategories.length}</span>
                )}
                <span className="category-trigger-chevron" aria-hidden="true" />
              </StyledButton>
              <PopupMenu
                anchorRef={categoryMenuAnchorRef}
                menuId={categoryMenuId}
                menuClassName="category-menu"
                open={categoryMenuOpen}
                onOpenChange={setCategoryMenuOpen}
                align="end"
              >
                <div role="group" aria-label="Categories">
                  <div className="category-menu-head">
                    <strong>Categories</strong>
                    {selectedCategories.length > 0 && (
                      <StyledButton type="button" onClick={() => setSelectedCategories([])}>Clear</StyledButton>
                    )}
                  </div>
                  {availableCategories.map((item) => {
                    const isSelected = selectedCategories.includes(item);
                    return (
                      <label key={item} className={isSelected ? "is-selected" : ""}>
                        <input
                          className="category-check"
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCategory(item)}
                          aria-label={`Filter category ${item}`}
                        />
                        <span className="category-label">{item}</span>
                        <span className="category-selected-mark" aria-hidden="true">✓</span>
                      </label>
                    );
                  })}
                </div>
              </PopupMenu>
            </div>
          </>
        )}
      </div>
      {!searchOnly && (
        <div className="filter-primary-row">
          <DateFilterControl
            dateFilter={dateFilter}
            selectedDate={selectedDate}
            selectedEndDate={selectedEndDate}
            occurrences={calendarOccurrencesOverride ?? calendarOccurrences}
            today={today}
            locateMeEnabled={locateMeEnabled}
            onLocateMeEnabledChange={setLocateMeEnabled}
            onDateFilter={setDateFilter}
            onSelectRange={selectRange}
          />
        </div>
      )}
    </div>
  );
}

function FullscreenMapFilters({
  open,
  onOpenChange,
  onBack,
  onSearchFocus,
  layerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onSearchFocus?: (searchTrayBoundary: number) => void;
  layerRef: RefObject<HTMLElement | null>;
}) {
  const {
    searchQuery,
    freeOnly,
    favoritesOnly,
    showLongRunning,
    selectedCategories,
  } = useEventFilterControls();
  const activeFilterCount = Number(Boolean(searchQuery.trim()))
    + Number(freeOnly)
    + Number(favoritesOnly)
    + Number(showLongRunning)
    + selectedCategories.length;
  const alignTrayBelowSearch = () => {
    window.requestAnimationFrame(() => {
      const searchField = layerRef.current?.querySelector<HTMLElement>(".search-field");
      if (!searchField) return;
      const filterBar = searchField.closest<HTMLElement>(".filter-bar");
      const computedGap = filterBar ? Number.parseFloat(window.getComputedStyle(filterBar).rowGap) : Number.NaN;
      const rowGap = Number.isFinite(computedGap) ? computedGap : 0;
      // Use the filter layout's real row gap so the tray sits below the search
      // field with the same rhythm as the rest of the filter controls.
      onSearchFocus?.(searchField.getBoundingClientRect().bottom + rowGap);
    });
  };
  const back = (
    <IconButton
      type="button"
      className="location-back fullscreen-map-back"
      onClick={onBack}
      aria-label="Exit full screen map"
      title="Close full screen map"
    >
      <CloseIcon />
    </IconButton>
  );
  const toggle = (
    <IconButton
      type="button"
      className={`fullscreen-filter-toggle ${activeFilterCount > 0 ? "has-active-filters" : ""}`}
      onClick={() => onOpenChange(!open)}
      aria-label={`${open ? "Hide" : "Show"} map filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""}`}
      aria-expanded={open}
      title={activeFilterCount > 0
        ? `${open ? "Hide" : "Show"} filters · ${activeFilterCount} active`
        : open ? "Hide filters" : "Filters"}
    >
      <FilterIcon />
      {activeFilterCount > 0 && (
        <span className="active-filter-count" aria-hidden="true">{activeFilterCount}</span>
      )}
    </IconButton>
  );
  const leadingControls = (
    <>
      {back}
      {toggle}
    </>
  );

  return (
    <section ref={layerRef} className={`fullscreen-map-filter-layer ${open ? "is-open" : ""}`} aria-label="Filter events on the map">
      {open || searchQuery
        ? <EventFilterBar leadingControl={leadingControls} searchOnly={!open} onSearchFocus={alignTrayBelowSearch} />
        : <div className="fullscreen-map-leading-controls">{leadingControls}</div>}
    </section>
  );
}

function FitMapIcon({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon">
      {collapsed ? (
        <path d="M3 7h4V3M17 7h-4V3M3 13h4v4M17 13h-4v4" />
      ) : (
        <path d="M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4" />
      )}
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon map-locate-icon">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v3M10 15v3M2 10h3M15 10h3" />
    </svg>
  );
}

type MapPinGroup = {
  key: string;
  lat: number;
  lng: number;
  items: EventOccurrence[];
};

function markerPrimaryItem(group: MapPinGroup, highlightedEventId: string | null): EventOccurrence {
  const selectedItem = group.items.find(({ event }) => event.id === highlightedEventId);
  if (selectedItem) return selectedItem;
  return group.items.reduce((earliest, item) => (
    item.eventNumber < earliest.eventNumber ? item : earliest
  ));
}

function markerIsFavorite(group: MapPinGroup): boolean {
  return group.items.some(({ event }) => event.is_favorite);
}

function escapeMarkerText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function eventMarkerIcon(group: MapPinGroup, highlightedEventId: string | null) {
  const selected = group.items.some(({ event }) => event.id === highlightedEventId);
  const favoritedLocation = markerIsFavorite(group);
  const primaryItem = markerPrimaryItem(group, highlightedEventId);
  const displayNumber = primaryItem.displayNumber;
  const variant = markerPinVariant(favoritedLocation);
  // Keep the number in the same SVG paint tree as the marker shape. The old
  // absolutely-positioned HTML sibling could be composited underneath the
  // filtered SVG on WebKit even with a CSS z-index, making it disappear on
  // device. SVG document order guarantees this text paints after the path.
  const number = displayNumber === null
    ? ""
    : `<text class="event-pin-number" x="${MARKER_PIN_VIEWBOX.width / 2}" y="${MARKER_PIN_VIEWBOX.height * variant.textYPercent / 100}">${displayNumber}</text>`;
  const stateClass = selected ? " is-selected" : "";
  const eventTitle = escapeMarkerText(primaryItem.event.title);

  return L.divIcon({
    className: "event-pin-shell",
    html: `<span class="event-pin${stateClass}" style="--pin-base-color:${variant.baseColor};--pin-width:${MARKER_PIN_GEOMETRY.width}px;--pin-height:${MARKER_PIN_GEOMETRY.height}px"><svg viewBox="0 0 ${MARKER_PIN_VIEWBOX.width} ${MARKER_PIN_VIEWBOX.height}" aria-hidden="true"><path d="${variant.iconPath}" />${number}</svg><span class="event-pin-title" aria-hidden="true">${eventTitle}</span></span>`,
    iconSize: [MARKER_PIN_GEOMETRY.width, MARKER_PIN_GEOMETRY.height],
    // Both SVG paths end at the same bottom point; anchoring that exact pixel
    // keeps the address position fixed when favorite or selection state changes.
    iconAnchor: [MARKER_PIN_GEOMETRY.anchorX, MARKER_PIN_GEOMETRY.anchorY],
  });
}

type MapFullscreenControl = {
  active: boolean;
  onToggle: () => void;
};

type FrameEventOnMap = (eventId: string, zoom?: number) => void;
type MapAnchor = { lat: number; lng: number };
type MapFrameSubject =
  | { kind: "point"; anchor: MapAnchor; zoom: number }
  | { kind: "bounds"; bounds: L.LatLngBoundsExpression; maxZoom: number };

// Option B's inline maps establish the browsing-level zoom used when a tray
// card frames its event. Keep this named value shared with defaultMapView so
// those two experiences cannot drift.
const OPTION_B_MINIMAP_ZOOM = 12;
// Selected pins and current location deliberately share one closer framing level.
const SELECTED_PIN_ZOOM = 15;
// Below this level the city-wide density makes persistent titles noisy. At and
// above it, collision detection decides which wrapped labels have room.
const PIN_TITLE_MIN_ZOOM = 15;

// Every map uses a familiar Midtown reference point whenever an event falls
// outside the user's Manhattan-first browsing area. The outlying event and
// Midtown are then guaranteed to share the initial viewport.
const MID_MANHATTAN_ANCHOR: MapAnchor = { lat: 40.758, lng: -73.9855 };
const PREFERRED_MANHATTAN_BOUNDS = {
  south: 40.70,
  north: 40.88,
  west: -74.02,
  east: -73.925,
};

function isOutsidePreferredManhattanBounds(event: EventItem): boolean {
  if (event.lat === null || event.lng === null) return false;
  return event.lat < PREFERRED_MANHATTAN_BOUNDS.south
    || event.lat > PREFERRED_MANHATTAN_BOUNDS.north
    || event.lng < PREFERRED_MANHATTAN_BOUNDS.west
    || event.lng > PREFERRED_MANHATTAN_BOUNDS.east;
}

function defaultMapView(event: EventItem | null): {
  initialSelectedZoom: number;
  initialReferenceAnchor?: MapAnchor;
} {
  return {
    initialSelectedZoom: OPTION_B_MINIMAP_ZOOM,
    initialReferenceAnchor: event && isOutsidePreferredManhattanBounds(event)
      ? MID_MANHATTAN_ANCHOR
      : undefined,
  };
}

function groupMapOccurrences(occurrences: EventOccurrence[]): MapPinGroup[] {
  const grouped = new Map<string, MapPinGroup>();
  for (const item of occurrences) {
    if (item.event.lat === null || item.event.lng === null) continue;
    const lat = item.event.lat;
    const lng = item.event.lng;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const existing = grouped.get(key);
    if (existing) existing.items.push(item);
    else grouped.set(key, { key, lat, lng, items: [item] });
  }
  return Array.from(grouped.values());
}

function ZoomInIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon map-zoom-icon">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="control-icon map-zoom-icon">
      <path d="M4 10h12" />
    </svg>
  );
}

type UserLocationSnapshot = Readonly<{
  status: "idle" | "locating" | "ready" | "error";
  position: MapAnchor | null;
  error: string | null;
}>;

const INITIAL_USER_LOCATION: UserLocationSnapshot = Object.freeze({
  status: "idle",
  position: null,
  error: null,
});
let sharedUserLocation: UserLocationSnapshot = INITIAL_USER_LOCATION;
const sharedLocationListeners = new Set<() => void>();

function publishUserLocation(snapshot: UserLocationSnapshot) {
  sharedUserLocation = snapshot;
  for (const listener of sharedLocationListeners) listener();
}

function restoreSharedUserLocation(position: MapAnchor | null) {
  if (!position || sharedUserLocation.position) return;
  sharedUserLocation = { status: "ready", position, error: null };
}

function refreshSharedUserLocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    publishUserLocation({ status: "error", position: sharedUserLocation.position, error: "Location isn’t available in this browser." });
    return;
  }
  publishUserLocation({ status: "locating", position: sharedUserLocation.position, error: null });
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => publishUserLocation({
      status: "ready",
      position: { lat: coords.latitude, lng: coords.longitude },
      error: null,
    }),
    () => publishUserLocation({
      status: "error",
      position: sharedUserLocation.position,
      error: "Couldn’t use your location. You can still browse every pin.",
    }),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
  );
}

function subscribeToUserLocation(listener: () => void) {
  sharedLocationListeners.add(listener);
  return () => sharedLocationListeners.delete(listener);
}

function useSharedUserLocation(): UserLocationSnapshot {
  return useSyncExternalStore(
    subscribeToUserLocation,
    () => sharedUserLocation,
    () => INITIAL_USER_LOCATION,
  );
}

function useMapFullscreen(initialActive = false) {
  const [active, setActive] = useState(initialActive);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);

  return {
    active,
    open: useCallback(() => setActive(true), []),
    close: useCallback(() => setActive(false), []),
    toggle: useCallback(() => setActive((current) => !current), []),
  };
}

function EventMap({
  occurrences,
  highlightedEventId,
  onSelectOccurrence,
  ariaLabel,
  className = "",
  fullscreenControl,
  controlsConfig,
  panToSelection = false,
  initialSelectedZoom,
  initialReferenceAnchor,
  layoutKey,
  topOccluderRef,
  bottomOccluderRef,
  frameSelectedControlRef,
}: {
  occurrences: EventOccurrence[];
  /** Single source of truth for both the green pin and the pin the camera frames. */
  highlightedEventId: string | null;
  onSelectOccurrence: (occurrenceId: string) => void;
  ariaLabel: string;
  className?: string;
  fullscreenControl?: MapFullscreenControl;
  controlsConfig?: MapControlsConfig;
  panToSelection?: boolean;
  initialSelectedZoom?: number;
  initialReferenceAnchor?: MapAnchor;
  layoutKey?: string | number | boolean;
  topOccluderRef?: RefObject<HTMLElement | null>;
  bottomOccluderRef?: RefObject<HTMLElement | null>;
  frameSelectedControlRef?: RefObject<FrameEventOnMap | null>;
}) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapControlsNode = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerInstances = useRef(new Map<string, L.Marker>());
  // The map owns exactly ONE title bubble: a single standalone tooltip whose
  // content and anchor are derived from highlightedEventId (see the highlight
  // effect below). No pin carries its own tooltip, so no per-pin title state
  // exists that could diverge from the highlight. `titleBubbleRequested` is
  // visibility only — set by a pin tap, cleared by a map tap or when the
  // highlight stops resolving — and never decides WHICH event is shown.
  const titleBubbleInstance = useRef<L.Tooltip | null>(null);
  const [titleBubbleRequested, setTitleBubbleRequested] = useState(false);
  const userMarker = useRef<L.Marker | null>(null);
  const frameUserLocationOnReady = useRef(false);
  const onSelectOccurrenceRef = useRef(onSelectOccurrence);
  const [mapFailed, setMapFailed] = useState(false);
  const [controlsTopOffsetPx, setControlsTopOffsetPx] = useState(0);
  const userLocation = useSharedUserLocation();
  const pinGroups = useMemo(() => groupMapOccurrences(occurrences), [occurrences]);
  const totalNumberedEvents = occurrences.reduce((maximum, item) => Math.max(maximum, item.eventNumber), 0);
  const groupsSignature = pinGroups.map((group) => `${group.key}:${group.items.map(({ occurrence }) => occurrence.id).join(",")}`).join("|");
  const markerStyleSignature = pinGroups.map((group) => group.items
    .map(({ event, occurrence, eventNumber, displayNumber }) => `${occurrence.id}:${eventNumber}:${displayNumber ?? ""}:${event.is_favorite ? 1 : 0}`)
    .join(","))
    .join("|");
  const controlsSignature = controlsConfig?.blocklist?.join("|") ?? "";
  const selectedItem = occurrences.find(({ event }) => (
    event.id === highlightedEventId && event.lat !== null && event.lng !== null
  )) ?? null;
  const selectedGroupKey = selectedItem && selectedItem.event.lat !== null && selectedItem.event.lng !== null
    ? `${selectedItem.event.lat.toFixed(5)},${selectedItem.event.lng.toFixed(5)}`
    : null;
  const selectedGroup = pinGroups.find((group) => group.key === selectedGroupKey) ?? null;
  const pinGroupsRef = useRef(pinGroups);
  const highlightedEventIdRef = useRef(highlightedEventId);
  const selectedGroupKeyRef = useRef(selectedGroupKey);
  pinGroupsRef.current = pinGroups;
  highlightedEventIdRef.current = highlightedEventId;
  selectedGroupKeyRef.current = selectedGroupKey;

  const hidePinTitles = useCallback(() => {
    for (const marker of markerInstances.current.values()) {
      marker.getElement()?.querySelector<HTMLElement>(".event-pin-title")?.classList.remove("is-visible");
    }
  }, []);

  const updatePinTitles = useCallback(() => {
    const map = mapInstance.current;
    const node = mapNode.current;
    hidePinTitles();
    if (!map || !node || map.getZoom() < PIN_TITLE_MIN_ZOOM) return;

    const toRect = (rect: DOMRect): MapLabelRect => ({
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
    });
    const nodeRect = node.getBoundingClientRect();
    const visibleFrame = visibleMapFrame(
      nodeRect,
      bottomOccluderRef?.current?.getBoundingClientRect(),
      0,
    );
    const mapRect: MapLabelRect = {
      ...toRect(nodeRect),
      bottom: nodeRect.bottom - visibleFrame.bottomOcclusion,
    };
    const candidates: Array<{ id: string; rect: MapLabelRect; priority: number }> = [];
    const obstacles: MapLabelRect[] = [];
    const intersectsVisibleMap = (rect: MapLabelRect) => (
      rect.left < mapRect.right
      && rect.right > mapRect.left
      && rect.top < mapRect.bottom
      && rect.bottom > mapRect.top
    );

    for (const group of pinGroupsRef.current) {
      const marker = markerInstances.current.get(group.key);
      const element = marker?.getElement();
      const label = element?.querySelector<HTMLElement>(".event-pin-title");
      if (!element || !label) continue;
      const markerRect = toRect(element.getBoundingClientRect());
      // Only pins in the uncovered map area participate. Markers outside the
      // viewport or underneath a tray cannot hide clear labels above the tray.
      if (!intersectsVisibleMap(markerRect)) continue;
      const primaryItem = markerPrimaryItem(group, highlightedEventIdRef.current);
      obstacles.push(markerRect);
      candidates.push({
        id: group.key,
        rect: toRect(label.getBoundingClientRect()),
        priority: markerZIndexOffset({
          deterministicRank: primaryItem.eventNumber,
          deterministicRankCount: totalNumberedEvents,
          tier: group.key === selectedGroupKeyRef.current
            ? "selected"
            : markerIsFavorite(group)
              ? "favorite"
              : "normal",
        }),
      });
    }

    const locationElement = userMarker.current?.getElement();
    if (locationElement) obstacles.push(toRect(locationElement.getBoundingClientRect()));
    const controls = node.parentElement?.querySelector<HTMLElement>(".map-floating-controls");
    if (controls) obstacles.push(toRect(controls.getBoundingClientRect()));
    const filterSurfaces = node.parentElement?.querySelectorAll<HTMLElement>(
      ".fullscreen-map-filter-layer",
    );
    for (const filterSurface of Array.from(filterSurfaces ?? [])) {
      obstacles.push(toRect(filterSurface.getBoundingClientRect()));
    }
    const attribution = node.querySelector<HTMLElement>(".leaflet-control-attribution");
    if (attribution) obstacles.push(toRect(attribution.getBoundingClientRect()));

    const visibleIds = visibleMapPinLabelIds(candidates, mapRect, obstacles);
    for (const id of visibleIds) {
      markerInstances.current.get(id)?.getElement()
        ?.querySelector<HTMLElement>(".event-pin-title")?.classList.add("is-visible");
    }
  }, [bottomOccluderRef, hidePinTitles, totalNumberedEvents]);

  useEffect(() => {
    onSelectOccurrenceRef.current = onSelectOccurrence;
  }, [onSelectOccurrence]);

  useEffect(() => {
    const overlay = topOccluderRef?.current;
    const mapElement = mapNode.current;
    if (!overlay || !mapElement || typeof ResizeObserver === "undefined") {
      setControlsTopOffsetPx(0);
      return;
    }
    const updateForOverlay = () => {
      const mapRect = mapElement.getBoundingClientRect();
      const overlayRect = overlay.getBoundingClientRect();
      setControlsTopOffsetPx(mapControlsTopOffset(mapRect.top, overlayRect.bottom));
      window.requestAnimationFrame(updatePinTitles);
    };
    updateForOverlay();
    const observer = new ResizeObserver(updateForOverlay);
    observer.observe(overlay);
    observer.observe(mapElement);
    return () => observer.disconnect();
  }, [topOccluderRef, updatePinTitles]);

  /**
   * One camera path frames every subject. The only view-specific input is the
   * optional tray that marks where the visible map ends.
   */
  const frameMap = (subject: MapFrameSubject, animate = true) => {
    const map = mapInstance.current;
    const node = mapNode.current;
    if (!map || !node) return;
    const frame = visibleMapFrame(
      node.getBoundingClientRect(),
      bottomOccluderRef?.current?.getBoundingClientRect(),
    );

    if (subject.kind === "bounds") {
      map.fitBounds(subject.bounds, {
        paddingTopLeft: [frame.paddingTopLeft[0], frame.paddingTopLeft[1]],
        paddingBottomRight: [frame.paddingBottomRight[0], frame.paddingBottomRight[1]],
        maxZoom: subject.maxZoom,
        animate,
      });
      return;
    }

    const target = L.latLng(subject.anchor.lat, subject.anchor.lng);
    const targetPoint = map.project(target, subject.zoom);
    const center = map.unproject(targetPoint.add(L.point(0, frame.centerOffsetY)), subject.zoom);
    if (animate) map.flyTo(center, subject.zoom, { duration: .45 });
    else map.setView(center, subject.zoom, { animate: false });
  };

  const requestAndFrameUserLocation = () => {
    frameUserLocationOnReady.current = true;
    refreshSharedUserLocation();
  };

  useEffect(() => {
    if (!frameUserLocationOnReady.current) return;
    if (userLocation.status === "error") {
      frameUserLocationOnReady.current = false;
      return;
    }
    if (userLocation.status !== "ready" || !userLocation.position) return;
    frameUserLocationOnReady.current = false;
    frameMap({ kind: "point", anchor: userLocation.position, zoom: SELECTED_PIN_ZOOM }, true);
  }, [userLocation.position, userLocation.status]);

  const fitAll = () => {
    if (pinGroups.length === 0) return;
    const bounds = L.latLngBounds(pinGroups.map((group) => [group.lat, group.lng] as L.LatLngExpression));
    if (pinGroups.length === 1) frameMap({ kind: "point", anchor: bounds.getCenter(), zoom: 14 }, false);
    else frameMap({ kind: "bounds", bounds, maxZoom: 14 }, false);
  };

  const focusEvent = useCallback<FrameEventOnMap>((eventId, zoom = SELECTED_PIN_ZOOM) => {
    const targetGroup = pinGroupsRef.current.find((group) => (
      group.items.some(({ event }) => event.id === eventId)
    ));
    if (!targetGroup) return;
    // Card taps should visibly carry the map to the selected event. The tray's
    // list now remains on the browser's native scroll path, so the Leaflet
    // camera animation no longer competes with custom content-scroll physics.
    frameMap({ kind: "point", anchor: targetGroup, zoom }, true);
  }, [bottomOccluderRef]);

  useEffect(() => {
    if (!frameSelectedControlRef) return;
    frameSelectedControlRef.current = focusEvent;
    return () => {
      if (frameSelectedControlRef.current === focusEvent) frameSelectedControlRef.current = null;
    };
  }, [focusEvent, frameSelectedControlRef]);

  useEffect(() => {
    if (!mapNode.current) return;
    setMapFailed(false);
    let titleFrame = 0;
    const schedulePinTitleUpdate = () => {
      window.cancelAnimationFrame(titleFrame);
      titleFrame = window.requestAnimationFrame(updatePinTitles);
    };
    try {
      const map = L.map(mapNode.current, {
        scrollWheelZoom: false,
        zoomControl: false,
        attributionControl: true,
      });
      mapInstance.current = map;
      markerInstances.current.clear();
      const userLocationPane = map.createPane(USER_LOCATION_PANE);
      userLocationPane.style.zIndex = String(USER_LOCATION_PANE_Z_INDEX);
      userLocationPane.style.pointerEvents = "none";
      map.on("zoomstart", hidePinTitles);
      map.on("zoomend moveend resize", schedulePinTitleUpdate);
      // Tapping the basemap dismisses the title bubble (visibility only; the
      // highlight — and therefore what a reopened bubble would title — is
      // untouched). Pin clicks do not reach this handler.
      map.on("click", () => setTitleBubbleRequested(false));
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);
      for (const group of pinGroups) {
        const first = group.items[0]!;
        const isSelected = group.key === selectedGroupKey;
        const primaryItem = markerPrimaryItem(group, highlightedEventId);
        const numberPrefix = primaryItem.displayNumber === null ? "" : `${primaryItem.displayNumber}. `;
        const markerLabel = group.items.length > 1
          ? `${numberPrefix}${group.items.length} event dates at ${first.event.venue}`
          : `${numberPrefix}${primaryItem.event.title} at ${primaryItem.event.venue}`;
        const marker = L.marker([group.lat, group.lng], {
          icon: eventMarkerIcon(group, highlightedEventId),
          zIndexOffset: markerZIndexOffset({
            deterministicRank: primaryItem.eventNumber,
            deterministicRankCount: totalNumberedEvents,
            tier: isSelected ? "selected" : markerIsFavorite(group) ? "favorite" : "normal",
          }),
          title: markerLabel,
          alt: markerLabel,
          keyboard: true,
        }).addTo(map);
        // No per-pin tooltip: tapping a pin only writes the shared selection
        // state and requests the map's one title bubble. Which event the
        // bubble titles is decided solely by the highlight effect deriving
        // it from highlightedEventId, so a tap and a scroll-select — which
        // write the same state — can never leave the bubble behind.
        marker.on("click", () => {
          setTitleBubbleRequested(true);
          onSelectOccurrenceRef.current(group.items[0]!.occurrence.id);
        });
        markerInstances.current.set(group.key, marker);
      }
      if (selectedGroup && initialReferenceAnchor) {
        frameMap({
          kind: "bounds",
          bounds: L.latLngBounds([
            [selectedGroup.lat, selectedGroup.lng],
            [initialReferenceAnchor.lat, initialReferenceAnchor.lng],
          ]),
          maxZoom: initialSelectedZoom ?? 14,
        }, false);
      } else if (typeof initialSelectedZoom === "number" && selectedGroup) {
        frameMap({ kind: "point", anchor: selectedGroup, zoom: initialSelectedZoom }, false);
      } else if (pinGroups.length > 0) {
        fitAll();
      } else {
        // A zero-result filter is still a valid map state. Keep the basemap
        // mounted at the normal Manhattan overview while the tray explains
        // that no cards match, rather than replacing the entire map surface.
        frameMap({ kind: "point", anchor: MID_MANHATTAN_ANCHOR, zoom: initialSelectedZoom ?? 12 }, false);
      }
      setTimeout(() => {
        map.invalidateSize();
        schedulePinTitleUpdate();
      }, 0);
    } catch {
      setMapFailed(true);
    }
    return () => {
      window.cancelAnimationFrame(titleFrame);
      titleBubbleInstance.current?.remove();
      titleBubbleInstance.current = null;
      userMarker.current?.remove();
      userMarker.current = null;
      mapInstance.current?.remove();
      mapInstance.current = null;
      markerInstances.current.clear();
    };
  }, [groupsSignature, controlsSignature, hidePinTitles, updatePinTitles]);

  useEffect(() => {
    const map = mapInstance.current;
    const position = userLocation.position;
    if (!map || !position) return;

    // Use a real Leaflet marker so the location dot follows the same pane,
    // transforms, and zoom-animation lifecycle as every event pin. The old
    // hand-positioned div only updated after `zoom`, so it visibly snapped at
    // the end of animated pinch zooms.
    if (!userMarker.current) {
      userMarker.current = L.marker([position.lat, position.lng], {
        icon: L.divIcon({
          className: "user-location-marker-shell",
          html: '<span class="user-location-marker" aria-hidden="true"><i></i></span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        pane: USER_LOCATION_PANE,
        interactive: false,
        keyboard: false,
        title: "You are here",
        alt: "Your current location",
      }).addTo(map);
    } else {
      // Preserve the marker instance across GPS fixes, including fixes that
      // arrive during a gesture, rather than rebuilding its DOM mid-animation.
      userMarker.current.setLatLng([position.lat, position.lng]);
    }

    window.requestAnimationFrame(updatePinTitles);
  }, [groupsSignature, totalNumberedEvents, updatePinTitles, userLocation.position?.lat, userLocation.position?.lng]);

  useEffect(() => {
    for (const group of pinGroups) {
      const marker = markerInstances.current.get(group.key);
      const isSelected = group.key === selectedGroupKey;
      const primaryItem = markerPrimaryItem(group, highlightedEventId);
      marker?.setIcon(eventMarkerIcon(group, highlightedEventId));
      marker?.setZIndexOffset(markerZIndexOffset({
        deterministicRank: primaryItem.eventNumber,
        deterministicRankCount: totalNumberedEvents,
        tier: isSelected ? "selected" : markerIsFavorite(group) ? "favorite" : "normal",
      }));
    }
    // The title bubble is applied here, inside the same highlight
    // application that paints the selected pin above — and it is DERIVED,
    // not stored: titleBubbleForHighlight computes the one bubble purely
    // from highlightedEventId, the single selection source of truth, and it
    // is rendered through the map's single standalone tooltip instance.
    // There is no per-pin tooltip content or open state anywhere, so the
    // bubble cannot show any event but the highlighted one, whichever
    // gesture (pin tap, card tap, or scroll-select) wrote the highlight.
    const bubble = titleBubbleForHighlight(pinGroups, highlightedEventId, titleBubbleRequested);
    const map = mapInstance.current;
    if (map) {
      if (bubble) {
        if (!titleBubbleInstance.current) {
          titleBubbleInstance.current = L.tooltip({ direction: "top", offset: [0, -34] });
        }
        const tooltip = titleBubbleInstance.current;
        // Venue text is third-party-sourced data and Leaflet renders string
        // tooltip content as HTML — hand it a DOM node whose textContent
        // carries the string, so the bubble can only ever render it as text.
        const bubbleTextNode = document.createElement("span");
        bubbleTextNode.textContent = bubble.content;
        tooltip.setLatLng([bubble.lat, bubble.lng]).setContent(bubbleTextNode);
        if (!map.hasLayer(tooltip)) tooltip.addTo(map);
      } else {
        titleBubbleInstance.current?.remove();
        // A highlight that no longer resolves to a pin ends the request, so
        // the bubble does not reappear uninvited if the event returns.
        if (titleBubbleRequested) setTitleBubbleRequested(false);
      }
    }
    if (panToSelection && selectedGroup && mapInstance.current && mapNode.current) {
      const frame = visibleMapFrame(
        mapNode.current.getBoundingClientRect(),
        bottomOccluderRef?.current?.getBoundingClientRect(),
        46,
      );
      mapInstance.current.panInside([selectedGroup.lat, selectedGroup.lng], {
        paddingTopLeft: [frame.paddingTopLeft[0], frame.paddingTopLeft[1]],
        paddingBottomRight: [frame.paddingBottomRight[0], frame.paddingBottomRight[1]],
      });
    }
    window.requestAnimationFrame(updatePinTitles);
  }, [selectedGroupKey, highlightedEventId, markerStyleSignature, panToSelection, titleBubbleRequested, totalNumberedEvents, updatePinTitles]);

  useLayoutEffect(() => {
    const node = mapNode.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let frame: number | null = null;
    let previousWidth = node.clientWidth;
    let previousHeight = node.clientHeight;
    const observer = new ResizeObserver(() => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width === previousWidth && height === previousHeight) return;
      previousWidth = width;
      previousHeight = height;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        // Invalidating with panning enabled keeps its geographic center and
        // zoom stable while Leaflet expands the live tile surface.
        mapInstance.current?.invalidateSize({ animate: false, pan: true, debounceMoveend: true });
        updatePinTitles();
      });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [updatePinTitles]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // A layout-key change is a final reconciliation after filters settle.
      // Camera state stays owned by the persistent Leaflet instance.
      mapInstance.current?.invalidateSize({ animate: false, pan: true });
      window.requestAnimationFrame(updatePinTitles);
    }, 40);
    return () => window.clearTimeout(timer);
  }, [layoutKey, updatePinTitles]);

  return (
    <>
      {!mapFailed && <div ref={mapNode} className={`map-canvas ${className}`} aria-label={ariaLabel} />}
      {!mapFailed && (
        <div
          ref={mapControlsNode}
          className="map-floating-controls"
          aria-label="Map controls"
          style={{ "--map-controls-top-offset": `${controlsTopOffsetPx}px` } as CSSProperties}
        >
          {fullscreenControl && !mapControlIsBlocked(controlsConfig, "fullscreen") && (
            <IconButton
              type="button"
              className={`map-fullscreen-toggle ${fullscreenControl.active ? "is-active" : ""}`}
              onClick={fullscreenControl.onToggle}
              aria-label={fullscreenControl.active ? "Exit full screen map" : "Open map full screen"}
              aria-pressed={fullscreenControl.active}
              title={fullscreenControl.active ? "Exit full screen" : "Full screen"}
            >
              <FitMapIcon collapsed={fullscreenControl.active} />
            </IconButton>
          )}
          {!userLocation.position && !mapControlIsBlocked(controlsConfig, "locate") && (
            <IconButton
              type="button"
              className={`map-locate-toggle ${userLocation.status === "locating" ? "is-locating" : ""}`}
              onClick={requestAndFrameUserLocation}
              aria-label={userLocation.status === "error" ? `${userLocation.error} Try locating me again` : "Locate me"}
              disabled={userLocation.status === "locating"}
              title={userLocation.status === "error" ? userLocation.error ?? "Try locating me again" : "Locate me"}
            >
              <LocateIcon />
            </IconButton>
          )}
          {!mapControlIsBlocked(controlsConfig, "zoom") && (
            <div className="map-zoom-controls" role="group" aria-label="Map zoom">
              <IconButton
                type="button"
                onClick={() => mapInstance.current?.zoomIn()}
                aria-label="Zoom in"
                title="Zoom in"
              >
                <ZoomInIcon />
              </IconButton>
              <IconButton
                type="button"
                onClick={() => mapInstance.current?.zoomOut()}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <ZoomOutIcon />
              </IconButton>
            </div>
          )}
        </div>
      )}
      {mapFailed && <div className={`map-empty map-load-error ${className}`}><h2>The map couldn’t load.</h2><p>The event list still works.</p></div>}
    </>
  );
}

function FeedTrayMap({
  occurrences,
  fullscreenActive,
  onToggleFullscreen,
  selectedOccurrenceId,
  onSelectOccurrence,
  locations,
  locationEventCounts,
  today,
  onToggleFavorite,
  onHide,
  onOpenLocation,
  frameSelectedControlRef,
}: {
  occurrences: EventOccurrence[];
  fullscreenActive: boolean;
  onToggleFullscreen: () => void;
  selectedOccurrenceId: string | null;
  onSelectOccurrence: (occurrenceId: string) => void;
  locations: LocationMap;
  locationEventCounts: LocationEventCounts;
  today: string;
  onToggleFavorite: (event: EventItem) => void;
  onHide: (event: EventItem) => void;
  onOpenLocation: (locationId: string) => void;
  frameSelectedControlRef?: RefObject<FrameEventOnMap | null>;
}) {
  const highlightedEvent = occurrences.find(({ occurrence }) => occurrence.id === selectedOccurrenceId)?.event ?? null;
  const initialView = defaultMapView(highlightedEvent);

  return (
    <>
      <EventMap
        occurrences={occurrences}
        highlightedEventId={highlightedEvent?.id ?? null}
        onSelectOccurrence={onSelectOccurrence}
        ariaLabel="Interactive map of events in the feed"
        className="feed-tray-map-canvas"
        fullscreenControl={{ active: false, onToggle: onToggleFullscreen }}
        {...initialView}
        frameSelectedControlRef={frameSelectedControlRef}
      />
      {fullscreenActive && createPortal(
        <MapWithEventCards
          occurrences={occurrences}
          locations={locations}
          locationEventCounts={locationEventCounts}
          today={today}
          selectedOccurrenceId={selectedOccurrenceId}
          onSelectOccurrence={onSelectOccurrence}
          onToggleFavorite={onToggleFavorite}
          onHide={onHide}
          onOpenLocation={onOpenLocation}
          fullscreen
          onToggleFullscreen={onToggleFullscreen}
        />,
        document.body,
      )}
    </>
  );
}

function EventRowMap({
  item,
  occurrences,
  sharedSelectedOccurrenceId,
  onSelectOccurrence,
  locations,
  locationEventCounts,
  today,
  onToggleFavorite,
  onHide,
  onOpenLocation,
}: {
  item: EventOccurrence;
  occurrences: EventOccurrence[];
  sharedSelectedOccurrenceId: string | null;
  onSelectOccurrence: (occurrenceId: string) => void;
  locations: LocationMap;
  locationEventCounts: LocationEventCounts;
  today: string;
  onToggleFavorite: (event: EventItem) => void;
  onHide: (event: EventItem) => void;
  onOpenLocation: (locationId: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fullscreen = useMapFullscreen();
  const [shouldLoad, setShouldLoad] = useState(false);
  const initialView = defaultMapView(item.event);

  useEffect(() => {
    const node = stageRef.current;
    if (!node || shouldLoad) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={stageRef} className="map-stage map-row-stage">
      {shouldLoad ? (
        <EventMap
          occurrences={occurrences}
          highlightedEventId={item.event.id}
          onSelectOccurrence={onSelectOccurrence}
          ariaLabel={`Map centered on ${item.event.title} at ${item.event.venue}`}
          className="map-row-canvas"
          fullscreenControl={{
            active: false,
            onToggle: () => {
              onSelectOccurrence(item.occurrence.id);
              fullscreen.toggle();
            },
          }}
          {...initialView}
        />
      ) : (
        <div className="map-canvas map-row-canvas map-row-loading" aria-label={`Map for ${item.event.title} is loading`} />
      )}
      {fullscreen.active && createPortal(
        <MapWithEventCards
          occurrences={occurrences}
          locations={locations}
          locationEventCounts={locationEventCounts}
          today={today}
          selectedOccurrenceId={sharedSelectedOccurrenceId}
          onSelectOccurrence={onSelectOccurrence}
          onToggleFavorite={onToggleFavorite}
          onHide={onHide}
          onOpenLocation={onOpenLocation}
          fullscreen
          onToggleFullscreen={fullscreen.toggle}
        />,
        document.body,
      )}
    </div>
  );
}

function MapEventCard({
  item,
  selected,
  today,
  onSelect,
  onToggleFavorite,
  onHide,
}: {
  item: EventOccurrence;
  selected: boolean;
  today: string;
  onSelect: () => void;
  onToggleFavorite: (event: EventItem) => void;
  onHide: (event: EventItem) => void;
}) {
  const { event, occurrence } = item;
  const otherDates = groupedAdditionalDates(event, occurrence);
  const displayAddress = formatDisplayAddress(event.address);
  const hasDistinctLocationName = !locationNameIsAddress(event.venue, displayAddress);
  return (
    <article
      className={`map-event-card ${selected ? "is-selected" : ""} ${occurrenceEnd(occurrence) < today ? "is-ended" : ""}`}
      onClick={(clickEvent) => {
        if ((clickEvent.target as HTMLElement).closest("a, button, input, textarea, select")) return;
        onSelect();
      }}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
        keyEvent.preventDefault();
        onSelect();
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Select ${event.title} at ${event.venue} on the map`}
    >
      <div className="map-event-visual">
        <EventImage
          event={event}
          className="map-event-image"
          placeholderVariant="map-card"
        />
        <span className="map-event-shade" aria-hidden="true" />
        <div className="map-event-date">
          <div className="map-event-primary-date">
            <strong>{occurrenceDateRange(occurrence)}</strong>
            <span>{occurrence.times_text}</span>
          </div>
          {otherDates.length > 0 && (
            <span className="map-event-other-dates">
              {otherDates.map((date) => <span key={date.key}>{date.text}</span>)}
            </span>
          )}
        </div>
        <IconButton
          className={`map-event-favorite ${event.is_favorite ? "is-favorite" : ""}`}
          onClick={() => onToggleFavorite(event)}
          aria-label={event.is_favorite ? `Remove ${event.title} from favorites` : `Add ${event.title} to favorites`}
          aria-pressed={event.is_favorite}
        >
          <HeartIcon filled={event.is_favorite} />
        </IconButton>
      </div>
      <div className="map-event-copy">
        <div className="map-event-heading-row">
          <h2>{item.displayNumber !== null ? `${item.displayNumber}. ` : ""}{event.title}</h2>
        </div>
        <p>{event.description}</p>
        <div className="map-event-place">
          {hasDistinctLocationName && <strong>{event.venue}</strong>}
          <span>{displayAddress}</span>
        </div>
        {!event.is_free && event.price_text && <span className="price-text">{event.price_text}</span>}
        <EventActionButtons event={event} onHide={onHide} />
      </div>
    </article>
  );
}

function EventCardsTray({
  occurrences,
  locations,
  locationEventCounts,
  today,
  selectedOccurrenceId,
  onSelectOccurrence,
  onToggleFavorite,
  onHide,
  onOpenLocation,
  scrollRef,
  cardInstances,
  trayElementRef,
  trayControllerRef,
  positions,
  onPositionChange,
  onFrameEvent,
}: {
  occurrences: EventOccurrence[];
  locations: LocationMap;
  locationEventCounts: LocationEventCounts;
  today: string;
  selectedOccurrenceId: string | null;
  onSelectOccurrence: (occurrenceId: string) => void;
  onToggleFavorite: (event: EventItem) => void;
  onHide: (event: EventItem) => void;
  onOpenLocation: (locationId: string) => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
  cardInstances?: RefObject<Map<string, HTMLElement>>;
  trayElementRef?: RefObject<HTMLElement | null>;
  trayControllerRef?: RefObject<ModalTrayController | null>;
  positions?: readonly TraySnapDefinition[];
  onPositionChange?: (position: TrayPosition) => void;
  onFrameEvent?: FrameEventOnMap;
}) {
  const internalScrollRef = useRef<HTMLDivElement | null>(null);
  const internalCardInstances = useRef(new Map<string, HTMLElement>());
  const trayScrollRef = scrollRef ?? internalScrollRef;
  const trayCardInstances = cardInstances ?? internalCardInstances;
  return (
    <div className="event-cards-tray-root">
      <ModalTray
        className="explore-sheet"
        ariaLabel="Events over the map"
        elementRef={trayElementRef}
        contentScrollRef={trayScrollRef}
        controllerRef={trayControllerRef}
        positions={positions}
        onPositionChange={onPositionChange}
      >
        <div ref={trayScrollRef} className="explore-sheet-scroll">
          {occurrences.length === 0 ? (
            <div className="no-results explore-no-results" role="status">
              <h2>No matches in this view.</h2>
              <p>Try another filter to bring events back onto the map.</p>
            </div>
          ) : (
          <div className="feed-list explore-feed-list" aria-label="Full event cards linked to the map">
            {occurrences.map(({ event, occurrence, displayNumber }) => {
              const selected = occurrence.id === selectedOccurrenceId;
              return (
                <div
                  className="explore-card-anchor"
                  key={`${event.id}:${occurrence.id}`}
                  ref={(node) => {
                    if (node) trayCardInstances.current.set(occurrence.id, node);
                    else trayCardInstances.current.delete(occurrence.id);
                  }}
                >
                  <EventCard
                    event={event}
                    location={locations.get(event.location_id)}
                    badgeOccurrence={occurrence}
                    displayNumber={displayNumber}
                    ended={occurrenceEnd(occurrence) < today}
                    onToggleFavorite={onToggleFavorite}
                    onHide={onHide}
                    canOpenLocation={(locationEventCounts.get(event.location_id) ?? 0) > 1}
                    onOpenLocation={onOpenLocation}
                    selectedOnMap={selected}
                    onSelectMap={() => {
                      if (onFrameEvent && event.lat !== null && event.lng !== null) {
                        selectAndFrameEvent({
                          eventId: event.id,
                          occurrenceId: occurrence.id,
                          onSelectOccurrence,
                          onFrameEvent,
                        });
                        return;
                      }
                      onSelectOccurrence(occurrence.id);
                    }}
                  />
                </div>
              );
            })}
          </div>
          )}
        </div>
      </ModalTray>
    </div>
  );
}

function MapView({ occurrences, today, selectedOccurrenceId, onSelectOccurrence, onToggleFavorite, onHide, locations, locationEventCounts, onOpenLocation }: {
  occurrences: EventOccurrence[];
  today: string;
  selectedOccurrenceId: string | null;
  onSelectOccurrence: (occurrenceId: string) => void;
  onToggleFavorite: (event: EventItem) => void;
  onHide: (event: EventItem) => void;
  locations: LocationMap;
  locationEventCounts: LocationEventCounts;
  onOpenLocation: (locationId: string) => void;
}) {
  const activeOccurrenceId = selectedOccurrenceId;
  const rowInstances = useRef(new Map<string, HTMLElement>());
  const mappable = useMemo(
    () => occurrences.filter(({ event }) => event.lat !== null && event.lng !== null),
    [occurrences],
  );
  const mappableIds = useMemo(
    () => new Set(mappable.map(({ occurrence }) => occurrence.id)),
    [mappable],
  );

  const selectItem = (item: EventOccurrence) => {
    onSelectOccurrence(item.occurrence.id);
  };

  const selectOccurrenceById = (occurrenceId: string) => {
    onSelectOccurrence(occurrenceId);
    window.requestAnimationFrame(() => {
      rowInstances.current.get(occurrenceId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <section className="map-view" aria-label="Event maps">
      {occurrences.length === 0 ? (
        <div className="map-empty"><h2>No matches in this view.</h2><p>Try another filter to bring events back onto the map.</p></div>
      ) : (
        <div className="map-event-list" aria-label="Filtered events with maps">
          {occurrences.map((item) => {
            const selected = item.occurrence.id === activeOccurrenceId;
            const hasMap = mappableIds.has(item.occurrence.id);
            return (
              <div
                className={`map-event-row ${hasMap ? "has-map" : "has-no-map"}`}
                key={`${item.event.id}:${item.occurrence.id}`}
                ref={(node) => {
                  if (node) rowInstances.current.set(item.occurrence.id, node);
                  else rowInstances.current.delete(item.occurrence.id);
                }}
              >
                <MapEventCard
                  item={item}
                  selected={selected}
                  today={today}
                  onSelect={() => selectItem(item)}
                  onToggleFavorite={onToggleFavorite}
                  onHide={onHide}
                />
                {hasMap ? (
                  <EventRowMap
                    item={item}
                    occurrences={mappable}
                    sharedSelectedOccurrenceId={selectedOccurrenceId}
                    onSelectOccurrence={selectOccurrenceById}
                    locations={locations}
                    locationEventCounts={locationEventCounts}
                    today={today}
                    onToggleFavorite={onToggleFavorite}
                    onHide={onHide}
                    onOpenLocation={onOpenLocation}
                  />
                ) : (
                  <div className="map-row-unavailable" role="status">
                    <strong>Map unavailable</strong>
                    <span>This event doesn’t have confirmed coordinates yet.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MapWithEventCards({
  occurrences,
  locations,
  locationEventCounts,
  today,
  selectedOccurrenceId,
  onSelectOccurrence,
  onToggleFavorite,
  onHide,
  onOpenLocation,
  fullscreen,
  onToggleFullscreen,
  frameSelectedControlRef,
}: {
  occurrences: EventOccurrence[];
  locations: LocationMap;
  locationEventCounts: LocationEventCounts;
  today: string;
  selectedOccurrenceId: string | null;
  onSelectOccurrence: (occurrenceId: string) => void;
  onToggleFavorite: (event: EventItem) => void;
  onHide: (event: EventItem) => void;
  onOpenLocation: (locationId: string) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  frameSelectedControlRef?: RefObject<FrameEventOnMap | null>;
}) {
  const cardInstances = useRef(new Map<string, HTMLElement>());
  const cardsScroll = useRef<HTMLDivElement | null>(null);
  const internalFrameSelectedControl = useRef<FrameEventOnMap | null>(null);
  const frameSelectedControl = frameSelectedControlRef ?? internalFrameSelectedControl;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersLayer = useRef<HTMLElement | null>(null);
  const cardsTray = useRef<HTMLElement | null>(null);
  const cardsTrayController = useRef<ModalTrayController | null>(null);
  const selectedOccurrenceIdRef = useRef(selectedOccurrenceId);
  selectedOccurrenceIdRef.current = selectedOccurrenceId;
  const {
    beginProgrammaticScroll,
    holdProgrammaticScroll,
    allowUserScrollSelection,
    isProgrammaticScroll,
  } = useProgrammaticScrollGuard();
  const mappable = useMemo(
    () => occurrences.filter(({ event }) => event.lat !== null && event.lng !== null),
    [occurrences],
  );
  const selectedItem = occurrences.find(({ occurrence }) => occurrence.id === selectedOccurrenceId)
    ?? mappable[0]
    ?? occurrences[0]
    ?? null;
  const initialView = defaultMapView(selectedItem?.event ?? null);

  useEffect(() => {
    const scrollElement = cardsScroll.current;
    if (!scrollElement || occurrences.length === 0) return;
    let frame: number | null = null;

    const selectMostVisibleCard = () => {
      frame = null;
      const viewport = scrollElement.getBoundingClientRect();
      const viewportCenter = (viewport.top + viewport.bottom) / 2;
      let bestId: string | null = null;
      let bestVisibleHeight = 0;
      let bestCenterDistance = Number.POSITIVE_INFINITY;

      for (const { occurrence } of occurrences) {
        const card = cardInstances.current.get(occurrence.id);
        if (!card) continue;
        const bounds = card.getBoundingClientRect();
        const visibleHeight = Math.max(0, Math.min(bounds.bottom, viewport.bottom) - Math.max(bounds.top, viewport.top));
        const centerDistance = Math.abs((bounds.top + bounds.bottom) / 2 - viewportCenter);
        if (
          visibleHeight > bestVisibleHeight
          || (visibleHeight === bestVisibleHeight && visibleHeight > 0 && centerDistance < bestCenterDistance)
        ) {
          bestId = occurrence.id;
          bestVisibleHeight = visibleHeight;
          bestCenterDistance = centerDistance;
        }
      }

      if (bestId && bestId !== selectedOccurrenceIdRef.current) {
        selectedOccurrenceIdRef.current = bestId;
        onSelectOccurrence(bestId);
      }
    };

    const scheduleSelection = () => {
      if (isProgrammaticScroll()) {
        holdProgrammaticScroll();
        return;
      }
      if (frame !== null) return;
      frame = window.requestAnimationFrame(selectMostVisibleCard);
    };
    const onUserScrollKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        allowUserScrollSelection();
      }
    };

    scrollElement.addEventListener("scroll", scheduleSelection, { passive: true });
    scrollElement.addEventListener("pointerdown", allowUserScrollSelection);
    scrollElement.addEventListener("touchstart", allowUserScrollSelection, { passive: true });
    scrollElement.addEventListener("wheel", allowUserScrollSelection, { passive: true });
    scrollElement.addEventListener("keydown", onUserScrollKeyDown);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSelection);
    resizeObserver?.observe(scrollElement);
    for (const card of cardInstances.current.values()) resizeObserver?.observe(card);
    scheduleSelection();

    return () => {
      scrollElement.removeEventListener("scroll", scheduleSelection);
      scrollElement.removeEventListener("pointerdown", allowUserScrollSelection);
      scrollElement.removeEventListener("touchstart", allowUserScrollSelection);
      scrollElement.removeEventListener("wheel", allowUserScrollSelection);
      scrollElement.removeEventListener("keydown", onUserScrollKeyDown);
      resizeObserver?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [occurrences, onSelectOccurrence, allowUserScrollSelection, holdProgrammaticScroll, isProgrammaticScroll]);

  const selectFromMap = (occurrenceId: string) => {
    beginProgrammaticScroll();
    selectedOccurrenceIdRef.current = occurrenceId;
    onSelectOccurrence(occurrenceId);
    window.requestAnimationFrame(() => {
      cardInstances.current.get(occurrenceId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <div className={`explore-map-stage ${fullscreen ? "is-fullscreen" : ""}`}>
      <EventMap
        occurrences={mappable}
        highlightedEventId={selectedItem?.event.id ?? null}
        onSelectOccurrence={selectFromMap}
        ariaLabel="Interactive explore map of filtered events"
        className="explore-map-canvas"
        fullscreenControl={fullscreen ? undefined : { active: false, onToggle: onToggleFullscreen }}
        {...initialView}
        layoutKey={`${fullscreen}:${filtersOpen}`}
        topOccluderRef={fullscreen ? filtersLayer : undefined}
        bottomOccluderRef={cardsTray}
        frameSelectedControlRef={frameSelectedControl}
      />
      {fullscreen && (
        <FullscreenMapFilters
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          onBack={onToggleFullscreen}
          layerRef={filtersLayer}
          onSearchFocus={(searchTrayBoundary) => {
            cardsTrayController.current?.revealBelowViewportBoundary(searchTrayBoundary);
          }}
        />
      )}
      <EventCardsTray
          occurrences={occurrences}
          locations={locations}
          locationEventCounts={locationEventCounts}
          today={today}
          selectedOccurrenceId={selectedItem?.occurrence.id ?? null}
          onSelectOccurrence={onSelectOccurrence}
          onToggleFavorite={onToggleFavorite}
          onHide={onHide}
          onOpenLocation={onOpenLocation}
          scrollRef={cardsScroll}
          cardInstances={cardInstances}
          trayElementRef={cardsTray}
          trayControllerRef={cardsTrayController}
          positions={MAP_EVENT_TRAY_POSITIONS}
          onFrameEvent={(eventId) => frameSelectedControl.current?.(eventId, OPTION_B_MINIMAP_ZOOM)}
        />
    </div>
  );
}

function ExploreView({ occurrences, locations, locationEventCounts, today, selectedOccurrenceId, onSelectOccurrence, onToggleFavorite, onHide, onOpenLocation }: {
  occurrences: EventOccurrence[];
  locations: LocationMap;
  locationEventCounts: LocationEventCounts;
  today: string;
  selectedOccurrenceId: string | null;
  onSelectOccurrence: (occurrenceId: string) => void;
  onToggleFavorite: (event: EventItem) => void;
  onHide: (event: EventItem) => void;
  onOpenLocation: (locationId: string) => void;
}) {
  const fullscreen = useMapFullscreen(true);

  return (
    <section className="explore-view" aria-label="Explore events with map and event sheet">
      <MapWithEventCards
        occurrences={occurrences}
        locations={locations}
        locationEventCounts={locationEventCounts}
        today={today}
        selectedOccurrenceId={selectedOccurrenceId}
        onSelectOccurrence={onSelectOccurrence}
        onToggleFavorite={onToggleFavorite}
        onHide={onHide}
        onOpenLocation={onOpenLocation}
        fullscreen={fullscreen.active}
        onToggleFullscreen={fullscreen.toggle}
      />
    </section>
  );
}

function IGSourceRow({ source }: { source: IGSourceItem }) {
  return (
    <li>
      <a
        className="ig-source-row"
        href={source.profile_url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open @${source.username} on Instagram`}
      >
        <span className="ig-source-identity">
          <span className="ig-source-username">
            @{source.username}
            {source.verified && <span className="ig-source-verified" aria-label="Verified"><VerifiedIcon /></span>}
          </span>
          {source.follower_count !== null && (
            <span className="ig-source-followers">{formatFollowerCount(source.follower_count)} followers</span>
          )}
        </span>
        <ExternalIcon />
      </a>
    </li>
  );
}

function IGSourcesView({ onBack }: { onBack: () => void }) {
  const sourcesQuery = useQuery({ queryKey: ["ig-sources"], queryFn: () => api.list_ig_sources({}) });
  const sources = sourcesQuery.data?.sources ?? [];

  return (
    <section className="ig-sources-view" aria-labelledby="ig-sources-heading">
      <header className="pushed-screen-header">
        <StyledButton type="button" className="location-back" onClick={onBack} aria-label="Back to events">
          <ChevronLeftIcon />
        </StyledButton>
        <div>
          <p className="section-label">Settings</p>
          <h1 id="ig-sources-heading">IG sources</h1>
        </div>
      </header>
      {sourcesQuery.isPending ? (
        <div className="loading-state"><span /><p>Loading sources…</p></div>
      ) : sourcesQuery.isError ? (
        <section className="error-state">
          <h2>Couldn’t load IG sources.</h2>
          <StyledButton className="primary-button" type="button" onClick={() => void sourcesQuery.refetch()}>Try again</StyledButton>
        </section>
      ) : sources.length === 0 ? (
        <div className="no-results"><h2>No IG sources yet.</h2><p>Sources will appear after the next collection sync.</p></div>
      ) : (
        <ul className="ig-source-list" aria-label="Instagram sources">
          {sources.map((source) => <IGSourceRow key={source.username} source={source} />)}
        </ul>
      )}
    </section>
  );
}

function LocationView({ location, events, occurrences, calendarOccurrences, today, onBack, onToggleFavorite, onHide, onOpenLocation }: {
  location: LocationItem;
  events: EventItem[];
  occurrences: EventOccurrence[];
  calendarOccurrences: EventOccurrence[];
  today: string;
  onBack: () => void;
  onToggleFavorite: (event: EventItem) => void;
  onHide: (event: EventItem) => void;
  onOpenLocation: (locationId: string) => void;
}) {
  const locationEvents = events.filter((event) => event.location_id === location.id);
  const cards = occurrences.filter(({ event }) => event.location_id === location.id);
  const upcomingCount = cards.filter(({ occurrence }) => occurrenceEnd(occurrence) >= today).length;

  return (
    <section className="location-view" aria-label={`Events at ${location.name}`}>
      <div className="location-profile">
        <StyledButton className="location-back" type="button" onClick={onBack} aria-label="Back to events">
          <ChevronLeftIcon />
        </StyledButton>
        <div className="location-profile-content">
          <h1>{location.name}</h1>
          <div className="location-addresses">
            {location.addresses.map((address) => (
              <span key={address}>{formatDisplayAddress(address)}</span>
            ))}
          </div>
          <div className="location-profile-actions">
            <span>{locationEvents.length} cached event{locationEvents.length === 1 ? "" : "s"} · {cards.length} date{cards.length === 1 ? "" : "s"} · {upcomingCount} upcoming</span>
            {location.website_url && (
              <a href={location.website_url} target="_blank" rel="noreferrer">Location website <ExternalIcon /></a>
            )}
          </div>
        </div>
      </div>
      <section className="discovery-tools location-discovery-tools" aria-label={`Find and filter events at ${location.name}`}>
        <EventFilterBar
          calendarOccurrencesOverride={calendarOccurrences.filter(({ event }) => event.location_id === location.id)}
        />
      </section>
      {cards.length === 0 ? (
        <div className="no-results"><h2>No events in this range.</h2><p>Choose another date range or return to the full feed.</p></div>
      ) : (
        <div className="feed-list location-feed-list">
          {cards.map(({ event, occurrence, displayNumber }) => (
              <EventCard
                key={`${event.id}:${occurrence.id}`}
                event={event}
                location={location}
                badgeOccurrence={occurrence}
                displayNumber={displayNumber}
                ended={occurrenceEnd(occurrence) < today}
                onToggleFavorite={onToggleFavorite}
                onHide={onHide}
                canOpenLocation={false}
                onOpenLocation={onOpenLocation}
              />
          ))}
        </div>
      )}
    </section>
  );
}

function useAdaptiveFilterAlignment() {
  const [row, setRow] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!row) return;

    let animationFrame = 0;
    const measure = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        // Measure the controls at their natural width so a previously stretched
        // row can return to left alignment when its container changes size.
        row.classList.remove("is-fully-aligned");
        const controls = Array.from(row.children).filter(
          (child): child is HTMLElement => child instanceof HTMLElement && child.offsetParent !== null,
        );
        const columnGap = Number.parseFloat(window.getComputedStyle(row).columnGap) || 0;
        const containerInnerWidth = nearestMeasurableContainerInnerWidth(row);
        const fullyAligned = shouldFullyAlignFilterRow(
          containerInnerWidth,
          controls.map((control) => control.getBoundingClientRect().width),
          columnGap,
        );
        row.classList.toggle("is-fully-aligned", fullyAligned);
      });
    };

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const observeControls = () => {
      resizeObserver?.disconnect();
      resizeObserver?.observe(row);
      Array.from(row.children).forEach((child) => resizeObserver?.observe(child));
    };
    const mutationObserver = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          observeControls();
          measure();
        });

    observeControls();
    mutationObserver?.observe(row, { childList: true });
    window.addEventListener("resize", measure);
    measure();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [row]);

  return useCallback((node: HTMLDivElement | null) => setRow(node), []);
}

export function App() {
  // Persisted choices (settings and event state) are initialized and serialized
  // through localPreferences.ts. Filters are session-only: they start from
  // createSessionFilters() on every load and are never saved or restored.
  const [initialPreferences] = useState(() => {
    const preferences = appPreferencesStore.load();
    restoreSharedUserLocation(preferences.settings.lastKnownLocation);
    return preferences;
  });
  const [initialSessionFilters] = useState(() => createSessionFilters());
  const appUserLocation = useSharedUserLocation();
  const [browserStorageProbe] = useState(() => probeBrowserLocalStorage());
  // The A/B/C view is a persisted setting (chosen in Settings), not tab
  // state: it initializes from the preferences record and is saved back with
  // the other settings, so the app reopens in the view the user last chose.
  const [view, setView] = useState<View>(initialPreferences.settings.view);
  const navigation = useNavigationStack<AppRoute>();
  // One app-level source of truth keeps feed cards, every map, and every tray in sync.
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSessionFilters.searchQuery);
  const [favoritesOnly, setFavoritesOnly] = useState(initialSessionFilters.favoritesOnly);
  const [freeOnly, setFreeOnly] = useState(initialSessionFilters.freeOnly);
  const [selectedCategories, setSelectedCategories] = useState(initialSessionFilters.selectedCategories);
  const [dateFilter, setDateFilter] = useState<DateFilter>(initialSessionFilters.dateFilter);
  const [selectedDate, setSelectedDate] = useState(initialSessionFilters.selectedDate);
  const [selectedEndDate, setSelectedEndDate] = useState(initialSessionFilters.selectedEndDate);
  const [showLongRunning, setShowLongRunning] = useState(initialSessionFilters.showLongRunning);
  const [locateMeEnabled, setLocateMeEnabled] = useState(initialPreferences.settings.locateMeEnabled);
  const sortBy: EventSortMode = locateMeEnabled && appUserLocation.position ? "distance" : "ig_mentions";
  const [theme, setTheme] = useState<ThemeId>(initialPreferences.settings.theme);
  const [debugMode, setDebugMode] = useState(initialPreferences.settings.debugMode);
  const [showIgMentions, setShowIgMentions] = useState(initialPreferences.settings.showIgMentions);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const settingsMenuId = useId();
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(initialPreferences.eventState.favoriteIds));
  const [hiddenIds, setHiddenIds] = useState(() => new Set(initialPreferences.eventState.hiddenIds));
  const [serverFavoritesMigrated, setServerFavoritesMigrated] = useState(initialPreferences.eventState.serverFavoritesMigrated);
  const today = nycToday();
  const query = useQuery({ queryKey: ["events"], queryFn: () => api.list_events({}) });
  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: () => api.list_locations({}) });
  const events = useMemo<EventItem[]>(
    () => (query.data?.events ?? []).map((event) => ({
      ...event,
      is_favorite: favoriteIds.has(event.id),
      is_hidden: hiddenIds.has(event.id),
    })),
    [query.data?.events, favoriteIds, hiddenIds],
  );
  const locations = locationsQuery.data?.locations ?? [];
  const locationsById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const locationEventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      if (!event.is_hidden) counts.set(event.location_id, (counts.get(event.location_id) ?? 0) + 1);
    }
    return counts;
  }, [events]);
  const openLocation = useCallback((locationId: string) => {
    navigation.push({ type: "location", locationId });
  }, [navigation.push]);
  const availableCategories = useMemo(
    () => Array.from(new Set(events.map((event) => event.category))).sort((a, b) => a.localeCompare(b)),
    [events],
  );
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    try {
      // Only non-filter state is persisted. Filter state lives in this
      // session alone, so nothing a previous session selected can narrow
      // (or empty) the view on the next load.
      appPreferencesStore.save({
        settings: {
          theme,
          view,
          debugMode,
          showIgMentions,
          locateMeEnabled,
          lastKnownLocation: appUserLocation.position,
        },
        eventState: {
          favoriteIds: Array.from(favoriteIds),
          hiddenIds: Array.from(hiddenIds),
          serverFavoritesMigrated,
        },
      });
    } catch {
      // The app remains usable for this session when browser storage is unavailable.
    }
  }, [
    locateMeEnabled,
    theme,
    view,
    debugMode,
    showIgMentions,
    appUserLocation.position,
    favoriteIds,
    hiddenIds,
    serverFavoritesMigrated,
  ]);
  useEffect(() => {
    if (!query.data || serverFavoritesMigrated) return;
    setFavoriteIds((current) => new Set([...current, ...query.data.favorite_ids]));
    setServerFavoritesMigrated(true);
  }, [query.data, serverFavoritesMigrated]);
  useEffect(() => {
    if (events.length === 0) return;
    setSelectedCategories((current) => current.filter((item) => availableCategories.includes(item)));
  }, [events.length, availableCategories]);
  const filterPipeline = useMemo(
    () => buildFilterPipeline(events, {
      favoritesOnly,
      freeOnly,
      selectedCategories,
      searchQuery,
      dateFilter,
      selectedDate,
      selectedEndDate,
      showLongRunning,
      sortBy,
      userLocation: appUserLocation.position,
      today,
    }),
    [events, favoritesOnly, freeOnly, selectedCategories, searchQuery, dateFilter, selectedDate, selectedEndDate, showLongRunning, sortBy, appUserLocation.position, today],
  );
  const filteredEvents = filterPipeline.visible.events;
  const visibleOccurrences = filterPipeline.visible.occurrences;
  const calendarOccurrences = filterPipeline.beforeDate.occurrences;
  useEffect(() => {
    if (visibleOccurrences.length === 0) {
      if (selectedOccurrenceId !== null) setSelectedOccurrenceId(null);
      return;
    }
    if (!visibleOccurrences.some(({ occurrence }) => occurrence.id === selectedOccurrenceId)) {
      setSelectedOccurrenceId(visibleOccurrences[0]!.occurrence.id);
    }
  }, [visibleOccurrences, selectedOccurrenceId]);
  const visibleEventCount = filteredEvents.length;
  const eventCountLabel = `${visibleEventCount} event${visibleEventCount === 1 ? "" : "s"}`;
  const headline = dateFilter === "today"
    ? `${eventCountLabel} today`
    : dateFilter === "tomorrow"
      ? `${eventCountLabel} tomorrow`
    : dateFilter === "week"
      ? `${eventCountLabel} this week`
      : dateFilter === "calendar"
        ? `${eventCountLabel} ${selectedEndDate ? `${shortDate(selectedDate)}–${shortDate(selectedEndDate)}` : `from ${shortDate(selectedDate)}`}`
        : `${visibleEventCount} upcoming event${visibleEventCount === 1 ? "" : "s"}`;
  const toggleFavorite = (event: EventItem) => {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(event.id)) next.delete(event.id);
      else next.add(event.id);
      return next;
    });
  };
  const hideEvent = (event: EventItem) => {
    setHiddenIds((current) => new Set(current).add(event.id));
  };
  const restoreHiddenEvents = () => setHiddenIds(new Set());
  const refresh = () => {
    void query.refetch();
    void locationsQuery.refetch();
  };

  return (
    <EventFilterControlsContext.Provider value={{
      searchQuery,
      setSearchQuery,
      freeOnly,
      setFreeOnly,
      favoritesOnly,
      setFavoritesOnly,
      showLongRunning,
      setShowLongRunning,
      selectedCategories,
      setSelectedCategories,
      availableCategories,
      dateFilter,
      selectedDate,
      selectedEndDate,
      calendarOccurrences,
      today,
      locateMeEnabled,
      setLocateMeEnabled,
      setDateFilter,
      selectRange: (startDate, endDate) => {
        setSelectedDate(startDate);
        setSelectedEndDate(endDate ?? "");
        setDateFilter("calendar");
      },
    }}>
    <NavigationStack
      entries={navigation.entries}
      onPop={navigation.pop}
      renderScreen={(entry, { pop }) => {
        if (entry.route.type === "ig-sources") {
          return (
            <div className="app-shell navigation-pushed-shell">
              <SafeAreaTopScrim backgroundColor="var(--bg)" />
              <main><IGSourcesView onBack={pop} /></main>
            </div>
          );
        }
        const routeLocation = locationsById.get(entry.route.locationId);
        if (!routeLocation) {
          return (
            <div className="app-shell navigation-pushed-shell">
              <SafeAreaTopScrim backgroundColor="var(--bg)" />
              <main>
                <section className="error-state">
                  <h1>This location is no longer available.</h1>
                  <StyledButton className="primary-button" type="button" onClick={pop}>Back</StyledButton>
                </section>
              </main>
            </div>
          );
        }
        return (
          <div className="app-shell navigation-pushed-shell">
            <SafeAreaTopScrim backgroundColor="var(--bg)" />
            <main>
              <LocationView
                location={routeLocation}
                events={filteredEvents}
                occurrences={visibleOccurrences}
                calendarOccurrences={calendarOccurrences}
                today={today}
                onBack={pop}
                onToggleFavorite={toggleFavorite}
                onHide={hideEvent}
                onOpenLocation={openLocation}
              />
            </main>
          </div>
        );
      }}
    >
      <div className="app-shell">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main>
        <header className="page-intro">
          <div>
            <p className="section-label">Upcoming in New York</p>
            <h1>{events.length > 0 ? headline : "Find the city’s next good thing"}</h1>
          </div>
          <div className={`settings-menu ${settingsMenuOpen ? "is-open" : ""}`}>
            <StyledButton
              ref={settingsMenuAnchorRef}
              type="button"
              className="popup-menu-trigger"
              onClick={() => setSettingsMenuOpen((open) => !open)}
              aria-label={settingsMenuOpen ? "Close settings" : "Open settings"}
              aria-haspopup="menu"
              aria-expanded={settingsMenuOpen}
              aria-controls={settingsMenuId}
              title="Settings"
            >
              <SettingsIcon />
            </StyledButton>
            <PopupMenu
              anchorRef={settingsMenuAnchorRef}
              menuId={settingsMenuId}
              menuClassName="settings-popover"
              open={settingsMenuOpen}
              onOpenChange={setSettingsMenuOpen}
              align="end"
              offset={8}
            >
              <p className="settings-label">Last updated</p>
              {query.data?.last_synced_at ? (
                <time dateTime={query.data.last_synced_at}>{syncedAtLabel(query.data.last_synced_at)}</time>
              ) : (
                <p>After the daily sync</p>
              )}
              <StyledButton
                type="button"
                className="settings-navigation-row"
                onClick={() => {
                  setSettingsMenuOpen(false);
                  navigation.push({ type: "ig-sources" });
                }}
              >
                <span>IG sources</span>
                <ChevronRightIcon />
              </StyledButton>
              <fieldset className="view-picker">
                <legend>View</legend>
                <div className="view-options" role="group" aria-label="View">
                  {VIEW_OPTIONS.map((item) => (
                    <StyledButton
                      key={item.view}
                      type="button"
                      className={view === item.view ? "active" : ""}
                      onClick={() => {
                        setView(item.view);
                        setSettingsMenuOpen(false);
                      }}
                      aria-pressed={view === item.view}
                    >
                      {item.label}
                    </StyledButton>
                  ))}
                </div>
              </fieldset>
              <fieldset className="theme-picker">
                <legend>Theme</legend>
                <div className="theme-options">
                  {THEME_OPTIONS.map((option) => (
                    <label key={option.id} className={theme === option.id ? "is-selected" : ""}>
                      <input
                        type="radio"
                        name="app-theme"
                        value={option.id}
                        checked={theme === option.id}
                        onChange={() => setTheme(option.id)}
                      />
                      <span
                        className="theme-preview"
                        aria-hidden="true"
                        style={{
                          "--theme-preview-bg": option.variables["--bg"],
                          "--theme-preview-surface": option.variables["--surface"],
                          "--theme-preview-accent": option.variables["--accent"],
                        } as CSSProperties}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="settings-toggle-row">
                <div>
                  <span>IG mentions</span>
                  <small>Show mention counts on Option A cards</small>
                </div>
                <ToggleButton
                  selected={showIgMentions}
                  onClick={() => setShowIgMentions((value) => !value)}
                  aria-label="IG mentions"
                >
                  {showIgMentions ? "On" : "Off"}
                </ToggleButton>
              </div>
              <div className="settings-toggle-row">
                <div>
                  <span>Debug mode</span>
                  <small>Show live app state</small>
                </div>
                <ToggleButton
                  selected={debugMode}
                  onClick={() => setDebugMode((value) => !value)}
                  aria-label="Debug mode"
                >
                  {debugMode ? "On" : "Off"}
                </ToggleButton>
              </div>
              <div className="hidden-events-setting">
                <div>
                  <span>Hidden events</span>
                  <strong>{hiddenIds.size}</strong>
                </div>
                <StyledButton type="button" onClick={restoreHiddenEvents} disabled={hiddenIds.size === 0}>
                  Restore all
                </StyledButton>
              </div>
            </PopupMenu>
          </div>
        </header>

        {events.length > 0 && (
          <section className="discovery-tools" aria-label="Find and filter events">
            <EventFilterBar />
          </section>
        )}

        {debugMode && (
          <aside className="debug-panel" aria-label="Debug details">
            <div className="debug-panel-heading">
              <strong>Debug</strong>
              <code>{view}</code>
            </div>
            <dl>
              <div><dt>Data</dt><dd>{query.status} · {events.length} events · {locations.length} locations</dd></div>
              <div><dt>Visible</dt><dd>{filteredEvents.length} events · {visibleOccurrences.length} cards</dd></div>
              <div><dt>Date</dt><dd>{dateFilter}{dateFilter === "calendar" ? ` · ${selectedDate}${selectedEndDate ? ` → ${selectedEndDate}` : " onward"}` : ""}</dd></div>
              <div><dt>Sort</dt><dd>{sortBy === "distance" && appUserLocation.position ? "Near me" : "IG mentions"}</dd></div>
              <div><dt>Selected</dt><dd><code>{selectedOccurrenceId ?? "none"}</code></dd></div>
              <div><dt>Local</dt><dd>{favoriteIds.size} favs · {hiddenIds.size} hidden</dd></div>
              <div>
                <dt>Storage</dt>
                <dd>
                  localStorage {browserStorageProbe.status}
                  {browserStorageProbe.status !== "available" ? ` · ${browserStorageProbe.detail}` : ""}
                  {` · preferences ${appPreferencesStore.durability}`}
                </dd>
              </div>
            </dl>
          </aside>
        )}

        {query.isPending ? (
          <div className="loading-state"><span /><p>Looking for the latest…</p></div>
        ) : query.isError ? (
          <section className="error-state"><h1>Couldn’t load the list.</h1><p>The last sync may still be running.</p><StyledButton className="primary-button" onClick={refresh}>Try again</StyledButton></section>
        ) : events.length === 0 ? (
          <EmptyState />
        ) : view === "feed" ? (
          <FeedView
            occurrences={visibleOccurrences}
            locations={locationsById}
            locationEventCounts={locationEventCounts}
            today={today}
            showIgMentionCount={showIgMentions}
            selectedOccurrenceId={selectedOccurrenceId}
            onSelectOccurrence={setSelectedOccurrenceId}
            onToggleFavorite={toggleFavorite}
            onHide={hideEvent}
            onOpenLocation={openLocation}
          />
        ) : view === "map" ? (
          <MapView
            occurrences={visibleOccurrences}
            today={today}
            selectedOccurrenceId={selectedOccurrenceId}
            onSelectOccurrence={setSelectedOccurrenceId}
            onToggleFavorite={toggleFavorite}
            onHide={hideEvent}
            locations={locationsById}
            locationEventCounts={locationEventCounts}
            onOpenLocation={openLocation}
          />
        ) : (
          <ExploreView
            occurrences={visibleOccurrences}
            locations={locationsById}
            locationEventCounts={locationEventCounts}
            today={today}
            selectedOccurrenceId={selectedOccurrenceId}
            onSelectOccurrence={setSelectedOccurrenceId}
            onToggleFavorite={toggleFavorite}
            onHide={hideEvent}
            onOpenLocation={openLocation}
          />
        )}

        </main>
      </div>
    </NavigationStack>
    </EventFilterControlsContext.Provider>
  );
}
