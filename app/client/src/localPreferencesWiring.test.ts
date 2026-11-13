import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const preferencesSource = await Bun.file(new URL("./localPreferences.ts", import.meta.url)).text();
const cityConfigSource = await Bun.file(new URL("./cityConfig.ts", import.meta.url)).text();

const appComponent = appSource.slice(appSource.indexOf("export function App()"));
const saveEffect = appComponent.slice(
  appComponent.indexOf("appPreferencesStore.save({"),
  appComponent.indexOf("useEffect(() => {\n    if (!query.data"),
);

describe("local preference wiring", () => {
  test("App is the sole runtime consumer of the local preference API", async () => {
    const consumers: string[] = [];
    const glob = new Bun.Glob("*.{ts,tsx}");

    for await (const file of glob.scan({ cwd: new URL(".", import.meta.url).pathname })) {
      if (file.endsWith(".test.ts") || file === "localPreferences.ts") continue;
      const source = await Bun.file(new URL(`./${file}`, import.meta.url)).text();
      if (source.includes('from "./localPreferences"')) consumers.push(file);
    }

    expect(consumers).toEqual(["App.tsx"]);
  });

  test("every persisted Settings choice initializes from and saves to the v2 record", () => {
    const persistedFields = [
      ["settings", "theme"],
      ["settings", "view"],
      ["settings", "debugMode"],
      ["settings", "showIgMentions"],
      ["settings", "locateMeEnabled"],
    ] as const;

    for (const [section, field] of persistedFields) {
      expect(appComponent).toContain(`initialPreferences.${section}.${field}`);
      expect(saveEffect).toMatch(new RegExp(`\\b${field},`));
    }

    expect(appComponent).toContain("restoreSharedUserLocation(preferences.settings.lastKnownLocation)");
    expect(saveEffect).toContain("lastKnownLocation: appUserLocation.position");
    expect(cityConfigSource).toContain('export const PREFERENCES_STORAGE_KEY = "things-to-do:preferences:v2"');
    expect(preferencesSource).toContain('from "./cityConfig"');
  });

  test("filters are session-only: initialized from the session factory and never saved", () => {
    const filterFields = [
      "searchQuery",
      "favoritesOnly",
      "freeOnly",
      "selectedCategories",
      "dateFilter",
      "selectedDate",
      "selectedEndDate",
      "showLongRunning",
    ] as const;

    expect(appComponent).toContain("createSessionFilters()");
    for (const field of filterFields) {
      expect(appComponent).toContain(`initialSessionFilters.${field}`);
      expect(appComponent).not.toContain(`initialPreferences.filters.${field}`);
      expect(saveEffect).not.toContain(field);
    }
    expect(saveEffect).not.toContain("filters");
    expect(preferencesSource).not.toContain("SavedFilters");
  });

  test("debug mode exposes the non-destructive browser storage probe and configured durability", () => {
    expect(appComponent).toContain("probeBrowserLocalStorage()");
    expect(appComponent).toContain("localStorage {browserStorageProbe.status}");
    expect(appComponent).toContain("preferences ${appPreferencesStore.durability}");
    expect(preferencesSource).toContain("reuses the sole preferences key");
  });

  test("favorites and hides persist, while interaction-only UI state stays transient", () => {
    for (const field of ["favoriteIds", "hiddenIds", "serverFavoritesMigrated"]) {
      expect(saveEffect).toMatch(new RegExp(`\\b${field}[:,]`));
    }

    // These are navigation/gesture/UI mechanics, not user preferences. Keeping
    // them out prevents an old session from reopening in a stale transient state.
    // (The A/B/C view is deliberately absent from this list: it moved into
    // Settings and is a persisted setting — see the persisted-fields test.)
    for (const transientField of [
      "selectedOccurrenceId",
      "mapVisible",
      "mapButtonBouncePlayed",
      "searchExpanded",
      "filtersOpen",
      "trayPosition",
    ]) {
      expect(preferencesSource).not.toMatch(new RegExp(`\\b${transientField}\\b`));
    }
  });
});
