import { describe, expect, test } from "bun:test";
import {
  createPreferencesStore,
  DEFAULT_PREFERENCES,
  loadAppPreferences,
  PREFERENCES_STORAGE_KEY,
  probeBrowserLocalStorage,
  saveAppPreferences,
  type AppPreferences,
} from "./localPreferences";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function withoutWarnings<T>(run: () => T): T {
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    return run();
  } finally {
    console.warn = originalWarn;
  }
}

describe("local preferences", () => {
  test("round trips every setting, favorite, and hide through the one v2 record", () => {
    const storage = new MemoryStorage();
    // Keep every value away from its default. This makes the test fail if any
    // setting is added to AppPreferences but omitted from hydration or saving.
    const preferences: AppPreferences = {
      settings: {
        theme: "night-market",
        view: "explore",
        debugMode: true,
        showIgMentions: false,
        locateMeEnabled: true,
        lastKnownLocation: { lat: 40.758, lng: -73.9855 },
      },
      eventState: {
        favoriteIds: ["event-a"],
        hiddenIds: ["event-b"],
        serverFavoritesMigrated: true,
      },
    };

    saveAppPreferences(preferences, storage);

    expect(loadAppPreferences(storage)).toEqual(preferences);
    expect(JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY)!)).toEqual(preferences);
  });

  test("the persisted record has no filters section at all", () => {
    const storage = new MemoryStorage();
    saveAppPreferences(structuredClone(DEFAULT_PREFERENCES), storage);

    const stored = JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY)!);
    expect(Object.keys(stored).sort()).toEqual(["eventState", "settings"]);
    expect(stored).not.toHaveProperty("filters");
  });

  test("a record with no view value opens on the default view with the rest of the record intact", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      settings: { theme: "night-market", debugMode: true },
      eventState: { favoriteIds: ["event-a"], hiddenIds: ["event-b"] },
    }));

    const loaded = loadAppPreferences(storage);
    expect(loaded.settings.view).toBe("feed");
    expect(loaded.settings.view).toBe(DEFAULT_PREFERENCES.settings.view);
    expect(loaded.settings.theme).toBe("night-market");
    expect(loaded.settings.debugMode).toBe(true);
    expect(loaded.eventState.favoriteIds).toEqual(["event-a"]);
    expect(loaded.eventState.hiddenIds).toEqual(["event-b"]);
    // Defaulting the view must not wipe the record the user still relies on.
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).not.toBeNull();
  });

  test("an invalid stored view falls back to the default without wiping the record", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      settings: { view: "option-d", theme: "night-market", showIgMentions: false },
      eventState: { favoriteIds: ["event-a"] },
    }));

    const loaded = withoutWarnings(() => loadAppPreferences(storage));
    expect(loaded.settings.view).toBe(DEFAULT_PREFERENCES.settings.view);
    expect(loaded.settings.theme).toBe("night-market");
    expect(loaded.settings.showIgMentions).toBe(false);
    expect(loaded.eventState.favoriteIds).toEqual(["event-a"]);
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).not.toBeNull();
  });

  test("each saved view value round-trips through the record", () => {
    for (const view of ["feed", "map", "explore"] as const) {
      const storage = new MemoryStorage();
      const preferences = structuredClone(DEFAULT_PREFERENCES);
      preferences.settings.view = view;
      saveAppPreferences(preferences, storage);
      expect(loadAppPreferences(storage).settings.view).toBe(view);
      expect(JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY)!).settings.view).toBe(view);
    }
  });

  test("fresh loads return the defaults without creating a saved record", () => {
    const storage = new MemoryStorage();

    expect(DEFAULT_PREFERENCES.settings.theme).toBe("museum-blue");
    expect(DEFAULT_PREFERENCES.settings.showIgMentions).toBe(true);
    expect(loadAppPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  test("ignores a legacy filters section — including a dead Calendar range and favorites-only — and keeps the rest of the record", () => {
    const storage = new MemoryStorage();
    const legacyRecord = {
      filters: {
        searchQuery: "dance",
        favoritesOnly: true,
        freeOnly: true,
        selectedCategories: ["dance", "popup"],
        dateFilter: "calendar",
        selectedDate: "2026-09-18",
        selectedEndDate: "2026-09-20",
        showLongRunning: true,
      },
      settings: { theme: "night-market", debugMode: true },
      eventState: { favoriteIds: ["event-a"], hiddenIds: ["event-b"] },
    };
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(legacyRecord));

    const loaded = loadAppPreferences(storage);
    expect(loaded).toEqual({
      settings: {
        ...DEFAULT_PREFERENCES.settings,
        theme: "night-market",
        debugMode: true,
      },
      eventState: {
        favoriteIds: ["event-a"],
        hiddenIds: ["event-b"],
        serverFavoritesMigrated: false,
      },
    });
    expect(loaded).not.toHaveProperty("filters");
    // Ignoring the filters must not wipe the record the user still relies on.
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).not.toBeNull();
  });

  test("ignores malformed legacy filter values instead of deleting the record", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      filters: { dateFilter: "later", favoritesOnly: "yes", selectedCategories: 42 },
      settings: { debugMode: true },
      eventState: { favoriteIds: ["event-a"] },
    }));

    const loaded = loadAppPreferences(storage);
    expect(loaded.settings.debugMode).toBe(true);
    expect(loaded.eventState.favoriteIds).toEqual(["event-a"]);
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).not.toBeNull();
  });

  test("drops the legacy filters section on the next save while keeping settings and event state", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      filters: { dateFilter: "calendar", selectedDate: "2026-09-18", selectedEndDate: "2026-09-20", favoritesOnly: true },
      settings: { theme: "night-market" },
      eventState: { favoriteIds: ["event-a"], hiddenIds: ["event-b"], serverFavoritesMigrated: true },
    }));

    const loaded = loadAppPreferences(storage);
    saveAppPreferences(loaded, storage);

    const stored = JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY)!);
    expect(stored).not.toHaveProperty("filters");
    expect(stored.settings.theme).toBe("night-market");
    expect(stored.eventState.favoriteIds).toEqual(["event-a"]);
    expect(stored.eventState.hiddenIds).toEqual(["event-b"]);
  });

  test("fills missing fields with defaults while preserving every valid saved choice", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      settings: { theme: "night-market", locateMeEnabled: true },
      eventState: {
        favoriteIds: ["event-a"],
        hiddenIds: ["event-b"],
      },
    }));

    expect(loadAppPreferences(storage)).toEqual({
      settings: {
        ...DEFAULT_PREFERENCES.settings,
        theme: "night-market",
        locateMeEnabled: true,
      },
      eventState: {
        ...DEFAULT_PREFERENCES.eventState,
        favoriteIds: ["event-a"],
        hiddenIds: ["event-b"],
      },
    });
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).not.toBeNull();
  });

  test("fills a wholly missing section with defaults", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      eventState: { favoriteIds: ["guggenheim"] },
    }));

    const loaded = loadAppPreferences(storage);
    expect(loaded.settings).toEqual(DEFAULT_PREFERENCES.settings);
    expect(loaded.eventState.favoriteIds).toEqual(["guggenheim"]);
    expect(loaded.eventState.hiddenIds).toEqual([]);
  });

  test("ignores unknown future fields without discarding known preferences", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      settings: { futureSetting: "compact", debugMode: true },
      eventState: { futureState: ["one"], favoriteIds: ["event-a"] },
    }));

    const loaded = loadAppPreferences(storage);
    expect(loaded.settings.debugMode).toBe(true);
    expect(loaded.eventState.favoriteIds).toEqual(["event-a"]);
  });

  test("restores a saved location while defaulting a newly added setting", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      settings: { lastKnownLocation: { lat: 40.758, lng: -73.9855 } },
      eventState: {},
    }));

    const loaded = loadAppPreferences(storage);
    expect(loaded.settings).toEqual({
      ...DEFAULT_PREFERENCES.settings,
      lastKnownLocation: { lat: 40.758, lng: -73.9855 },
    });
  });

  test("hydrates a missing theme without changing existing saved settings", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      settings: { debugMode: true, showIgMentions: true },
      eventState: { favoriteIds: ["event-a"] },
    }));

    const loaded = loadAppPreferences(storage);
    expect(loaded.settings.theme).toBe(DEFAULT_PREFERENCES.settings.theme);
    expect(loaded.settings.debugMode).toBe(true);
    expect(loaded.settings.showIgMentions).toBe(true);
    expect(loaded.eventState.favoriteIds).toEqual(["event-a"]);
  });

  test("deletes a record with a present unsupported theme", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      settings: { theme: "not-a-theme", debugMode: true },
      eventState: {},
    }));

    const loaded = withoutWarnings(() => loadAppPreferences(storage));
    expect(loaded).toEqual(DEFAULT_PREFERENCES);
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  test("deletes an unusable saved location outside valid coordinate bounds", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      settings: { lastKnownLocation: { lat: 140.758, lng: -73.9855 } },
      eventState: {},
    }));

    const loaded = withoutWarnings(() => loadAppPreferences(storage));
    expect(loaded).toEqual(DEFAULT_PREFERENCES);
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  test("deletes and ignores malformed JSON with a warning", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, "{not-json");
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => warnings.push(String(message));

    try {
      expect(loadAppPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
    } finally {
      console.warn = originalWarn;
    }
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
    expect(warnings[0]).toContain(PREFERENCES_STORAGE_KEY);
    expect(warnings[0]).toContain("not valid JSON");
  });

  test("deletes an unusable record when a present persisted field has the wrong type", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      settings: { debugMode: "yes" },
      eventState: { favoriteIds: ["one"], hiddenIds: [], serverFavoritesMigrated: false },
    }));

    const loaded = withoutWarnings(() => loadAppPreferences(storage));
    expect(loaded).toEqual(DEFAULT_PREFERENCES);
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  test("deletes an unrelated object that has no recognized preference sections", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ oldFilters: { search: "dance" } }));

    const loaded = withoutWarnings(() => loadAppPreferences(storage));
    expect(loaded).toEqual(DEFAULT_PREFERENCES);
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  test("probes browser storage without changing the sole preferences record", () => {
    const storage = new MemoryStorage();
    const existing = JSON.stringify({ settings: { theme: "night-market" } });
    storage.setItem(PREFERENCES_STORAGE_KEY, existing);

    expect(probeBrowserLocalStorage(storage)).toEqual({
      status: "available",
      detail: "Read/write succeeded",
    });
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBe(existing);

    const emptyStorage = new MemoryStorage();
    expect(probeBrowserLocalStorage(emptyStorage).status).toBe("available");
    expect(emptyStorage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  test("reports browser storage errors without throwing", () => {
    const storage = {
      getItem: () => { throw new DOMException("blocked", "SecurityError"); },
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    expect(probeBrowserLocalStorage(storage)).toEqual({
      status: "blocked",
      detail: "SecurityError",
    });
  });

  test("the shared preferences store persists through localStorage for every build", () => {
    const storage = new MemoryStorage();
    const store = createPreferencesStore(storage);
    const preferences = structuredClone(DEFAULT_PREFERENCES);
    preferences.eventState.favoriteIds = ["event-a"];
    preferences.eventState.hiddenIds = ["event-b"];
    preferences.settings.theme = "night-market";

    store.save(preferences);

    expect(store.durability).toBe("persistent");
    expect(store.load()).toEqual(preferences);
    expect(JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY)!)).toEqual(preferences);

    store.clear();
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
    expect(store.load()).toEqual(DEFAULT_PREFERENCES);
  });
});
