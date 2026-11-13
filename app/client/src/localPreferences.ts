import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "./themes";
import { CITY_TIME_ZONE, PREFERENCES_STORAGE_KEY } from "./cityConfig";

export { PREFERENCES_STORAGE_KEY };

export type DateFilter = "today" | "tomorrow" | "week" | "future" | "calendar";

/**
 * The A/B/C layout choice. Unlike tab state, the view is a persisted setting
 * (chosen in Settings, alongside the theme): it is written to the preferences
 * record and restored on every load. It is not a filter, so the session-only
 * filters rule does not apply to it.
 */
export type AppView = "feed" | "map" | "explore";

export const DEFAULT_VIEW: AppView = "feed";

export function isAppView(value: unknown): value is AppView {
  return value === "feed" || value === "map" || value === "explore";
}

/**
 * Filter state is session-only by design (decided 2026-11-12, after the
 * restored-state decay incident): it is created fresh on every load, works
 * normally while the app is open, and is never written to the preferences
 * record or restored from one. A previous design persisted filters, and two
 * of them — a bounded Calendar range and the favorites-only toggle — decayed
 * with time into permanently empty views that looked exactly like data loss.
 * Never persisting filters removes that failure class entirely.
 */
export type SessionFilters = {
  searchQuery: string;
  favoritesOnly: boolean;
  freeOnly: boolean;
  selectedCategories: string[];
  dateFilter: DateFilter;
  selectedDate: string;
  selectedEndDate: string;
  showLongRunning: boolean;
};

export type AppPreferences = {
  settings: {
    theme: ThemeId;
    view: AppView;
    debugMode: boolean;
    showIgMentions: boolean;
    locateMeEnabled: boolean;
    lastKnownLocation: {
      lat: number;
      lng: number;
    } | null;
  };
  eventState: {
    favoriteIds: string[];
    hiddenIds: string[];
    serverFavoritesMigrated: boolean;
  };
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type PreferencesDurability = "persistent";

export type BrowserStorageProbe =
  | { status: "available"; detail: "Read/write succeeded" }
  | { status: "blocked"; detail: string }
  | { status: "unavailable"; detail: "No browser window" };

/**
 * One persistent preference contract shared by the fullstack and static builds.
 * Both builds use the same localStorage key, validation, defaults, and lifecycle.
 * The record persists only what is not a filter: settings (theme, view, IG
 * mentions, debug mode, sort/location) and event state (favorites, hidden
 * events).
 */
export interface PreferencesStore {
  readonly durability: PreferencesDurability;
  load(): AppPreferences;
  save(preferences: AppPreferences): void;
  clear(): void;
}

type HydrationResult =
  | { ok: true; preferences: AppPreferences }
  | { ok: false; reason: string };

export const DEFAULT_PREFERENCES: AppPreferences = {
  settings: {
    theme: DEFAULT_THEME_ID,
    view: DEFAULT_VIEW,
    debugMode: false,
    showIgMentions: true,
    locateMeEnabled: false,
    lastKnownLocation: null,
  },
  eventState: {
    favoriteIds: [],
    hiddenIds: [],
    serverFavoritesMigrated: false,
  },
};

function freshDefaults(): AppPreferences {
  return structuredClone(DEFAULT_PREFERENCES);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSavedLocation(value: unknown): value is AppPreferences["settings"]["lastKnownLocation"] {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return typeof value.lat === "number"
    && Number.isFinite(value.lat)
    && value.lat >= -90
    && value.lat <= 90
    && typeof value.lng === "number"
    && Number.isFinite(value.lng)
    && value.lng >= -180
    && value.lng <= 180;
}

function nycDateParts(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CITY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

/** The current calendar date in New York City, as YYYY-MM-DD. */
export function nycToday(now: Date = new Date()): string {
  return nycDateParts(now).date;
}

/**
 * The landing date selection for a fresh session: a single day of Today,
 * except from 20:00 New York time onward, when today's events are mostly
 * over and people are planning Tomorrow instead. The Week tab remains a
 * manual choice; it is never the landing state and no date choice is ever
 * restored.
 */
export function initialDateFilter(now: Date = new Date()): DateFilter {
  return nycDateParts(now).hour >= 20 ? "tomorrow" : "today";
}

/**
 * The clean, unfiltered filter state every load starts from. It depends only
 * on the clock — never on anything a previous session left behind — so no
 * restored selection can narrow what first appears.
 */
export function createSessionFilters(now: Date = new Date()): SessionFilters {
  return {
    searchQuery: "",
    favoritesOnly: false,
    freeOnly: false,
    selectedCategories: [],
    dateFilter: initialDateFilter(now),
    selectedDate: nycToday(now),
    selectedEndDate: "",
    showLongRunning: false,
  };
}

/**
 * Hydrates a partial record field-by-field. Missing fields use today's defaults,
 * so adding a preference never wipes the user's existing choices. A present but
 * invalid persisted field makes the record unusable; callers delete it and
 * start fresh. A legacy `filters` section is recognized but ignored entirely:
 * filters are session-only now, so its values — valid or not — are dropped on
 * load and never written back, without discarding the rest of the record.
 */
function hydratePreferences(value: unknown): HydrationResult {
  if (!isRecord(value)) return { ok: false, reason: "the saved value is not an object" };

  const sectionNames = ["filters", "settings", "eventState"] as const;
  const hasKnownSection = sectionNames.some((name) => name in value);
  if (!hasKnownSection) return { ok: false, reason: "the saved object has no recognized preference sections" };

  for (const name of ["settings", "eventState"] as const) {
    if (name in value && !isRecord(value[name])) {
      return { ok: false, reason: `the ${name} section is not an object` };
    }
  }

  const defaults = freshDefaults();
  const settings = isRecord(value.settings) ? value.settings : {};
  const eventState = isRecord(value.eventState) ? value.eventState : {};
  const invalid = (path: string, expected: string): HydrationResult => ({
    ok: false,
    reason: `${path} is present but is not ${expected}`,
  });

  if ("theme" in settings && !isThemeId(settings.theme)) return invalid("settings.theme", "a supported theme");
  // The view is the one field exempt from the invalid-field rule above: a
  // record written before the setting existed has no view, and a stored view
  // this build does not know (a newer build's value, a hand edit) falls back
  // to the default view below instead of discarding the whole record.
  if ("debugMode" in settings && typeof settings.debugMode !== "boolean") return invalid("settings.debugMode", "a boolean");
  if ("showIgMentions" in settings && typeof settings.showIgMentions !== "boolean") return invalid("settings.showIgMentions", "a boolean");
  if ("locateMeEnabled" in settings && typeof settings.locateMeEnabled !== "boolean") return invalid("settings.locateMeEnabled", "a boolean");
  if ("lastKnownLocation" in settings && !isSavedLocation(settings.lastKnownLocation)) {
    return invalid("settings.lastKnownLocation", "null or a valid latitude/longitude pair");
  }
  if ("favoriteIds" in eventState && !isStringArray(eventState.favoriteIds)) return invalid("eventState.favoriteIds", "an array of strings");
  if ("hiddenIds" in eventState && !isStringArray(eventState.hiddenIds)) return invalid("eventState.hiddenIds", "an array of strings");
  if (
    "serverFavoritesMigrated" in eventState
    && typeof eventState.serverFavoritesMigrated !== "boolean"
  ) return invalid("eventState.serverFavoritesMigrated", "a boolean");

  return {
    ok: true,
    preferences: {
      settings: {
        theme: (settings.theme as ThemeId | undefined) ?? defaults.settings.theme,
        view: isAppView(settings.view) ? settings.view : defaults.settings.view,
        debugMode: (settings.debugMode as boolean | undefined) ?? defaults.settings.debugMode,
        showIgMentions: (settings.showIgMentions as boolean | undefined) ?? defaults.settings.showIgMentions,
        locateMeEnabled: (settings.locateMeEnabled as boolean | undefined) ?? defaults.settings.locateMeEnabled,
        lastKnownLocation:
          (settings.lastKnownLocation as AppPreferences["settings"]["lastKnownLocation"] | undefined)
          ?? defaults.settings.lastKnownLocation,
      },
      eventState: {
        favoriteIds: (eventState.favoriteIds as string[] | undefined) ?? defaults.eventState.favoriteIds,
        hiddenIds: (eventState.hiddenIds as string[] | undefined) ?? defaults.eventState.hiddenIds,
        serverFavoritesMigrated:
          (eventState.serverFavoritesMigrated as boolean | undefined) ?? defaults.eventState.serverFavoritesMigrated,
      },
    },
  };
}

function warnAndDelete(target: StorageLike, reason: string): void {
  console.warn(`[NYC Things To Do] Ignoring and deleting ${PREFERENCES_STORAGE_KEY}: ${reason}.`);
  try {
    target.removeItem(PREFERENCES_STORAGE_KEY);
  } catch {
    // The app remains usable for this session when browser storage is unavailable.
  }
}

export function loadAppPreferences(storage?: StorageLike): AppPreferences {
  if (!storage && typeof window === "undefined") return freshDefaults();
  const target = storage ?? window.localStorage;

  let serialized: string | null;
  try {
    serialized = target.getItem(PREFERENCES_STORAGE_KEY);
  } catch {
    return freshDefaults();
  }
  if (serialized === null) return freshDefaults();

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    warnAndDelete(target, "the saved value is not valid JSON");
    return freshDefaults();
  }

  const hydrated = hydratePreferences(parsed);
  if (hydrated.ok) return hydrated.preferences;

  warnAndDelete(target, hydrated.reason);
  return freshDefaults();
}

export function saveAppPreferences(preferences: AppPreferences, storage?: StorageLike): void {
  if (!storage && typeof window === "undefined") return;
  const target = storage ?? window.localStorage;
  target.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

/**
 * Non-destructively checks whether this browser context can round-trip localStorage.
 * It reuses the sole preferences key and restores its exact previous value, so the
 * diagnostic never creates another persistent key or changes the user's settings.
 */
export function probeBrowserLocalStorage(storage?: StorageLike): BrowserStorageProbe {
  if (!storage && typeof window === "undefined") {
    return { status: "unavailable", detail: "No browser window" };
  }

  let target: StorageLike | null = null;
  let previousValue: string | null = null;
  let readPreviousValue = false;
  try {
    target = storage ?? window.localStorage;
    previousValue = target.getItem(PREFERENCES_STORAGE_KEY);
    readPreviousValue = true;
    const probeValue = previousValue ?? JSON.stringify(DEFAULT_PREFERENCES);
    target.setItem(PREFERENCES_STORAGE_KEY, probeValue);
    if (target.getItem(PREFERENCES_STORAGE_KEY) !== probeValue) {
      return { status: "blocked", detail: "The value did not round-trip" };
    }
    return { status: "available", detail: "Read/write succeeded" };
  } catch (error) {
    const name = error instanceof Error && error.name ? error.name : "Storage error";
    return { status: "blocked", detail: name };
  } finally {
    if (readPreviousValue && target) {
      try {
        if (previousValue === null) target.removeItem(PREFERENCES_STORAGE_KEY);
        else target.setItem(PREFERENCES_STORAGE_KEY, previousValue);
      } catch {
        // The probe result already reports that browser storage is blocked.
      }
    }
  }
}

function createPersistentPreferencesStore(storage?: StorageLike): PreferencesStore {
  return {
    durability: "persistent",
    load: () => loadAppPreferences(storage),
    save: (preferences) => saveAppPreferences(preferences, storage),
    clear: () => {
      if (!storage && typeof window === "undefined") return;
      const target = storage ?? window.localStorage;
      try {
        target.removeItem(PREFERENCES_STORAGE_KEY);
      } catch {
        // The app remains usable when browser storage becomes unavailable.
      }
    },
  };
}

export function createPreferencesStore(storage?: StorageLike): PreferencesStore {
  return createPersistentPreferencesStore(storage);
}

/**
 * Shared singleton used by both builds. The data adapter still changes with the
 * build mode; user preferences do not.
 */
export const appPreferencesStore = createPreferencesStore();
