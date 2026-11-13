import { describe, expect, test } from "bun:test";
import {
  createSessionFilters,
  initialDateFilter,
  loadAppPreferences,
  nycToday,
  PREFERENCES_STORAGE_KEY,
  saveAppPreferences,
} from "./localPreferences";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

// The record a pre-change session could have left behind: a bounded Calendar
// range that ended weeks ago (no occurrence can ever fall inside it again)
// plus favorites-only switched on after every favorite had ended. Under the
// old persisted-filters design this record emptied every view on every open.
const DECAYED_RECORD = {
  filters: {
    searchQuery: "salsa",
    favoritesOnly: true,
    freeOnly: true,
    selectedCategories: ["dance"],
    dateFilter: "calendar",
    selectedDate: "2026-09-18",
    selectedEndDate: "2026-09-20",
    showLongRunning: false,
  },
  settings: {
    theme: "night-market",
    debugMode: true,
    showIgMentions: false,
    locateMeEnabled: true,
    lastKnownLocation: { lat: 40.758, lng: -73.9855 },
  },
  eventState: {
    favoriteIds: ["ended-favorite"],
    hiddenIds: ["hidden-event"],
    serverFavoritesMigrated: true,
  },
};

// Thu Nov 12 2026 in New York (EST, UTC-5): 15:00Z is 10:00 local,
// 01:00Z the next day is 20:00 local the same evening.
const MORNING_NYC = new Date("2026-11-12T15:00:00Z");
const EVENING_759PM_NYC = new Date("2026-11-13T00:59:00Z");
const EVENING_800PM_NYC = new Date("2026-11-13T01:00:00Z");

describe("session-only filters", () => {
  test("(a) a decayed saved record loads into the clean Today default, so events are visible", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(DECAYED_RECORD));

    // Loading preferences yields no filter state at all to restore.
    const preferences = loadAppPreferences(storage);
    expect(preferences).not.toHaveProperty("filters");

    // The session starts from the clock alone: unfiltered, on Today.
    const session = createSessionFilters(MORNING_NYC);
    expect(session).toEqual({
      searchQuery: "",
      favoritesOnly: false,
      freeOnly: false,
      selectedCategories: [],
      dateFilter: "today",
      selectedDate: "2026-11-12",
      selectedEndDate: "",
      showLongRunning: false,
    });
    // With favoritesOnly off and no date range restored, nothing from the
    // decayed record can narrow the first view: today's events show.
    expect(session.favoritesOnly).toBe(false);
    expect(session.dateFilter).not.toBe("calendar");
  });

  test("(a) the same decayed record loads into Tomorrow once the clock reaches 20:00", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(DECAYED_RECORD));
    loadAppPreferences(storage);

    expect(createSessionFilters(EVENING_759PM_NYC).dateFilter).toBe("today");
    const session = createSessionFilters(EVENING_800PM_NYC);
    expect(session.dateFilter).toBe("tomorrow");
    expect(session.selectedDate).toBe("2026-11-12");
    expect(session.favoritesOnly).toBe(false);
    expect(session.selectedCategories).toEqual([]);
  });

  test("(b) favorites, hidden events, theme, and the other settings survive the decayed record intact", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(DECAYED_RECORD));

    const preferences = loadAppPreferences(storage);
    expect(preferences.eventState.favoriteIds).toEqual(["ended-favorite"]);
    expect(preferences.eventState.hiddenIds).toEqual(["hidden-event"]);
    expect(preferences.eventState.serverFavoritesMigrated).toBe(true);
    expect(preferences.settings.theme).toBe("night-market");
    expect(preferences.settings.debugMode).toBe(true);
    expect(preferences.settings.showIgMentions).toBe(false);
    expect(preferences.settings.locateMeEnabled).toBe(true);
    expect(preferences.settings.lastKnownLocation).toEqual({ lat: 40.758, lng: -73.9855 });
    // The record itself is not wiped for carrying legacy filter fields.
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).not.toBeNull();
  });

  test("(c) saving after a session writes no filter fields, and the legacy filters are dropped", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(DECAYED_RECORD));

    // This is the exact shape App saves: settings + event state only, no
    // matter what the user selected in the filter UI during the session.
    const preferences = loadAppPreferences(storage);
    saveAppPreferences(preferences, storage);

    const stored = JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY)!);
    expect(stored).not.toHaveProperty("filters");
    for (const filterField of [
      "searchQuery",
      "favoritesOnly",
      "freeOnly",
      "selectedCategories",
      "dateFilter",
      "selectedDate",
      "selectedEndDate",
      "showLongRunning",
    ]) {
      expect(JSON.stringify(stored)).not.toContain(filterField);
    }
    expect(stored.eventState.favoriteIds).toEqual(["ended-favorite"]);
    expect(stored.settings.theme).toBe("night-market");
  });

  test("the landing date filter switches at exactly 20:00 New York time", () => {
    expect(initialDateFilter(new Date("2026-11-12T05:00:00Z"))).toBe("today"); // 00:00 EST
    expect(initialDateFilter(EVENING_759PM_NYC)).toBe("today"); // 19:59 EST
    expect(initialDateFilter(EVENING_800PM_NYC)).toBe("tomorrow"); // 20:00 EST
    expect(initialDateFilter(new Date("2026-11-13T04:59:00Z"))).toBe("tomorrow"); // 23:59 EST
  });

  test("nycToday reports the New York calendar date, not the UTC date", () => {
    // 01:00Z on Nov 13 is still Nov 12 in New York.
    expect(nycToday(EVENING_800PM_NYC)).toBe("2026-11-12");
    expect(nycToday(MORNING_NYC)).toBe("2026-11-12");
  });

  test("every fresh session starts unfiltered regardless of the clock", () => {
    for (const now of [MORNING_NYC, EVENING_800PM_NYC]) {
      const session = createSessionFilters(now);
      expect(session.searchQuery).toBe("");
      expect(session.favoritesOnly).toBe(false);
      expect(session.freeOnly).toBe(false);
      expect(session.selectedCategories).toEqual([]);
      expect(session.selectedEndDate).toBe("");
      expect(session.showLongRunning).toBe(false);
    }
  });
});

describe("session filter wiring", () => {
  test("App initializes filters from the session factory, never from saved preferences", async () => {
    const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
    expect(appSource).toContain("createSessionFilters()");
    expect(appSource).toContain("initialSessionFilters.dateFilter");
    expect(appSource).toContain("initialSessionFilters.favoritesOnly");
    expect(appSource).not.toContain("initialPreferences.filters");
  });

  test("App's save effect writes settings and event state only — no filter fields", async () => {
    const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
    const appComponent = appSource.slice(appSource.indexOf("export function App()"));
    const saveEffect = appComponent.slice(
      appComponent.indexOf("appPreferencesStore.save({"),
      appComponent.indexOf("useEffect(() => {\n    if (!query.data"),
    );
    expect(saveEffect).not.toContain("filters");
    for (const filterField of [
      "searchQuery",
      "favoritesOnly",
      "freeOnly",
      "selectedCategories",
      "dateFilter",
      "selectedDate",
      "selectedEndDate",
      "showLongRunning",
    ]) {
      expect(saveEffect).not.toContain(filterField);
    }
    expect(saveEffect).toContain("theme,");
    expect(saveEffect).toContain("favoriteIds");
    expect(saveEffect).toContain("hiddenIds");
  });

  test("the restored-state decay guards are gone", async () => {
    const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
    expect(appSource).not.toContain("resolveRestoredDateSelection");
    expect(appSource).not.toContain("resolveRestoredFavoritesOnly");
    expect(appSource).not.toContain("restoredDateFilter");
    expect(appSource).not.toContain("restoredFavoritesFilter");
  });
});
