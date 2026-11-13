export type ThemeId = "city-sage" | "night-market" | "museum-blue" | "sunlit-amber";

type ThemePalette = {
  bg: string;
  surface: string;
  surfaceSoft: string;
  text: string;
  dim: string;
  muted: string;
  border: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentContrast: string;
  onDark: string;
  emphasis: string;
  emphasisStrong: string;
  emphasisSoft: string;
  favoritePin: string;
  favoritePinStrong: string;
  mapPin: string;
  userLocation: string;
  favorite: string;
  favoriteSoft: string;
  favoriteText: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  dateText: string;
  dateSubtle: string;
  controlTrack: string;
  bodyCopy: string;
  calendarPast: string;
  trayHandle: string;
  debugBg: string;
  debugText: string;
  debugCode: string;
  debugDim: string;
  mediaBlank: string;
  mediaDark: string;
  pinLabel: string;
  placeholderGold: string;
  placeholderMint: string;
  placeholderStart: string;
  placeholderMid: string;
  placeholderEnd: string;
  placeholderGlaze: string;
  placeholderBlue: string;
  placeholderTexture: string;
  placeholderOrb: string;
  placeholderRibbon: string;
  mapLoadingStart: string;
  mapLoadingMid: string;
  mapLoadingEnd: string;
  mapPlaceholderTop: string;
  mapPlaceholderStart: string;
  mapPlaceholderMid: string;
  mapPlaceholderEnd: string;
  mapPlaceholderAccent: string;
  placeholderShadowRgb: string;
  dateShadowRgb: string;
  shadowRgb: string;
  navigationShadowRgb: string;
  heroShadeRgb: string;
  mediaShadeRgb: string;
  favoriteOverlayRgb: string;
  userLocationShadowRgb: string;
  selectedPinShadowRgb: string;
  pinShadowRgb: string;
};

function alpha(rgb: string, opacity: number): string {
  return `rgb(${rgb} / ${opacity}%)`;
}

function createVariables(palette: ThemePalette): Record<`--${string}`, string> {
  const shadow = palette.shadowRgb;
  return {
    "--transparent": "transparent",
    "--bg": palette.bg,
    "--surface": palette.surface,
    "--surface-raised": palette.surface,
    "--surface-soft": palette.surfaceSoft,
    "--text": palette.text,
    "--dim": palette.dim,
    "--muted": palette.muted,
    "--border": palette.border,
    "--accent": palette.accent,
    "--accent-strong": palette.accentStrong,
    "--accent-soft": palette.accentSoft,
    "--accent-contrast": palette.accentContrast,
    "--emphasis": palette.emphasis,
    "--emphasis-strong": palette.emphasisStrong,
    "--emphasis-soft": palette.emphasisSoft,
    "--favorite-pin": palette.favoritePin,
    "--favorite-pin-strong": palette.favoritePinStrong,
    "--map-pin": palette.mapPin,
    "--user-location": palette.userLocation,
    "--focus": palette.accent,
    "--favorite": palette.favorite,
    "--favorite-soft": palette.favoriteSoft,
    "--favorite-text": palette.favoriteText,
    "--success": palette.success,
    "--success-soft": palette.successSoft,
    "--danger": palette.danger,
    "--danger-soft": palette.dangerSoft,
    "--date-bg": palette.surface,
    "--date-text": palette.dateText,
    "--date-subtle": palette.dateSubtle,
    "--filter-control-color": palette.dim,
    "--space-surface": palette.surface,
    "--space-surface-alt": palette.surfaceSoft,
    "--space-muted": palette.dim,
    "--space-border": palette.border,
    "--space-accent": palette.accent,
    "--on-dark": palette.onDark,
    "--control-track": palette.controlTrack,
    "--body-copy": palette.bodyCopy,
    "--calendar-past": palette.calendarPast,
    "--tray-handle": palette.trayHandle,
    "--debug-bg": palette.debugBg,
    "--debug-text": palette.debugText,
    "--debug-code": palette.debugCode,
    "--debug-dim": palette.debugDim,
    "--media-blank": palette.mediaBlank,
    "--media-dark": palette.mediaDark,
    "--pin-label": palette.pinLabel,
    "--placeholder-gold-soft": alpha(palette.placeholderGold, 82),
    "--placeholder-gold-strong": alpha(palette.placeholderGold, 85),
    "--placeholder-mint": alpha(palette.placeholderMint, 78),
    "--placeholder-start": palette.placeholderStart,
    "--placeholder-mid": palette.placeholderMid,
    "--placeholder-end": palette.placeholderEnd,
    "--placeholder-glaze": alpha(palette.placeholderGlaze, 70),
    "--placeholder-blue-glaze": alpha(palette.placeholderBlue, 22),
    "--placeholder-glaze-border": alpha(palette.placeholderGlaze, 38),
    "--placeholder-blue-wash": alpha(palette.placeholderBlue, 12),
    "--placeholder-texture": alpha(palette.placeholderTexture, 16),
    "--placeholder-orb": alpha(palette.placeholderOrb, 62),
    "--placeholder-ribbon": alpha(palette.placeholderRibbon, 40),
    "--placeholder-sheen": alpha(palette.placeholderGlaze, 18),
    "--map-loading-start": palette.mapLoadingStart,
    "--map-loading-mid": palette.mapLoadingMid,
    "--map-loading-end": palette.mapLoadingEnd,
    "--map-placeholder-top": alpha(palette.mapPlaceholderTop, 85),
    "--map-placeholder-start": palette.mapPlaceholderStart,
    "--map-placeholder-mid": palette.mapPlaceholderMid,
    "--map-placeholder-end": palette.mapPlaceholderEnd,
    "--map-placeholder-accent": alpha(palette.mapPlaceholderAccent, 22),
    "--map-placeholder-sheen": alpha(palette.placeholderGlaze, 18),
    "--placeholder-shadow": alpha(palette.placeholderShadowRgb, 10),
    "--date-shadow": alpha(palette.dateShadowRgb, 12),
    "--shadow-04": alpha(shadow, 4),
    "--shadow-06": alpha(shadow, 6),
    "--shadow-08": alpha(shadow, 8),
    "--shadow-09": alpha(shadow, 9),
    "--shadow-10": alpha(shadow, 10),
    "--shadow-12": alpha(shadow, 12),
    "--shadow-13": alpha(shadow, 13),
    "--shadow-14": alpha(shadow, 14),
    "--shadow-16": alpha(shadow, 16),
    "--shadow-17": alpha(shadow, 17),
    "--shadow-18": alpha(shadow, 18),
    "--shadow-22": alpha(shadow, 22),
    "--shadow-24": alpha(shadow, 24),
    "--navigation-shadow": alpha(palette.navigationShadowRgb, 12),
    "--media-shade-48": alpha(palette.heroShadeRgb, 48),
    "--media-shade-13": alpha(palette.heroShadeRgb, 13),
    "--media-shade-76": alpha(palette.mediaShadeRgb, 76),
    "--media-shade-38": alpha(palette.mediaShadeRgb, 38),
    "--date-chip-bg": alpha(palette.placeholderGlaze, 95),
    "--map-attribution-bg": alpha(palette.placeholderGlaze, 80),
    "--map-control-bg": alpha(palette.placeholderGlaze, 94),
    "--pin-label-halo": alpha(palette.placeholderGlaze, 96),
    "--on-dark-muted": alpha(palette.placeholderGlaze, 82),
    "--favorite-overlay-44": alpha(palette.favoriteOverlayRgb, 44),
    "--favorite-overlay-46": alpha(palette.favoriteOverlayRgb, 46),
    "--favorite-overlay-56": alpha(palette.favoriteOverlayRgb, 56),
    "--favorite-overlay-shadow-17": alpha(palette.favoriteOverlayRgb, 17),
    "--favorite-overlay-shadow-18": alpha(palette.favoriteOverlayRgb, 18),
    "--user-location-shadow": alpha(palette.userLocationShadowRgb, 34),
    "--pin-shadow": alpha(palette.pinShadowRgb, 30),
    "--pin-text-stroke": alpha(palette.pinShadowRgb, 24),
    "--selected-pin-shadow": alpha(palette.selectedPinShadowRgb, 42),
    "--filter-control-shadow": `0 2px 7px ${alpha(shadow, 10)}`,
    "--tray-outer-shadow": `0 -3px 12px ${alpha(shadow, 24)}, 0 -16px 36px ${alpha(shadow, 16)}`,
    "--shadow-float": `0 6px 18px ${alpha(shadow, 13)}`,
    "--shadow-selected-card": `0 3px 7px ${alpha(shadow, 10)}, 0 14px 28px ${alpha(shadow, 18)}, 0 28px 52px ${alpha(shadow, 12)}`,
    "--fullscreen-control-shadow": `0 3px 8px ${alpha(shadow, 16)}, 0 10px 24px ${alpha(shadow, 22)}`,
    "--feed-map-toggle-shadow": `0 5px 12px ${alpha(shadow, 22)}, 0 16px 34px ${alpha(shadow, 28)}, 0 28px 54px ${alpha(shadow, 18)}`,
    "--feed-toggle-shadow": `0 5px 16px ${alpha(shadow, 24)}, 0 12px 30px ${alpha(shadow, 14)}`,
  };
}

const CITY_SAGE: ThemePalette = {
  bg: "#f4f6f3", surface: "#ffffff", surfaceSoft: "#e9eeea", text: "#17201d", dim: "#626d68", muted: "#909994", border: "#dce3de",
  accent: "#176b52", accentStrong: "#0d513d", accentSoft: "#e0f2e9", accentContrast: "#ffffff", onDark: "#ffffff",
  emphasis: "#9acb3d", emphasisStrong: "#36540f", emphasisSoft: "#f0f7df",
  favoritePin: "#e4649a", favoritePinStrong: "#661c3d", mapPin: "#42524c", userLocation: "#2f7de1",
  favorite: "#b37600", favoriteSoft: "#fff1c7", favoriteText: "#865b00", success: "#19734b", successSoft: "#e1f5eb", danger: "#c92946", dangerSoft: "#ffeaee",
  dateText: "#222a27", dateSubtle: "#3b4541", controlTrack: "#e5e8ed", bodyCopy: "#4d535d", calendarPast: "#c7ccd5", trayHandle: "#c5cbc7",
  debugBg: "#202824", debugText: "#eef5f1", debugCode: "#c6e798", debugDim: "#9da9a3",
  mediaBlank: "#e6e9ed", mediaDark: "#34413c", pinLabel: "#252b2d",
  placeholderGold: "229 217 168", placeholderMint: "176 213 202", placeholderStart: "#dcebe4", placeholderMid: "#eef2e7", placeholderEnd: "#d9e5df",
  placeholderGlaze: "255 255 255", placeholderBlue: "156 186 215", placeholderTexture: "44 70 88", placeholderOrb: "255 250 222", placeholderRibbon: "136 181 169",
  mapLoadingStart: "#e1e6e2", mapLoadingMid: "#f0f3f0", mapLoadingEnd: "#dce4df", mapPlaceholderTop: "229 217 168", mapPlaceholderStart: "#8ba399", mapPlaceholderMid: "#587068", mapPlaceholderEnd: "#34413c", mapPlaceholderAccent: "110 154 178", placeholderShadowRgb: "57 84 111", dateShadowRgb: "13 17 23",
  shadowRgb: "22 29 43", navigationShadowRgb: "20 25 35", heroShadeRgb: "13 17 23", mediaShadeRgb: "14 20 18", favoriteOverlayRgb: "20 24 31", userLocationShadowRgb: "24 66 120", selectedPinShadowRgb: "107 147 30", pinShadowRgb: "0 0 0",
};

const NIGHT_MARKET: ThemePalette = {
  bg: "#121816", surface: "#1c2521", surfaceSoft: "#26312c", text: "#f2f6f3", dim: "#b0bbb5", muted: "#7e8c85", border: "#35443d",
  accent: "#58c9a0", accentStrong: "#8ce2c2", accentSoft: "#203d33", accentContrast: "#0e1a16", onDark: "#ffffff",
  emphasis: "#b8e45b", emphasisStrong: "#d8f49a", emphasisSoft: "#2d3b20",
  favoritePin: "#f080ac", favoritePinStrong: "#ffd0e2", mapPin: "#7f9289", userLocation: "#6ea8ff",
  favorite: "#f0bf55", favoriteSoft: "#40351d", favoriteText: "#ffd783", success: "#72d6a1", successSoft: "#1e3c2d", danger: "#ff7285", dangerSoft: "#46242a",
  dateText: "#17201d", dateSubtle: "#d6e0db", controlTrack: "#2b3631", bodyCopy: "#ced7d2", calendarPast: "#59675f", trayHandle: "#617169",
  debugBg: "#090d0b", debugText: "#eaf7f0", debugCode: "#c8ef78", debugDim: "#8da198",
  mediaBlank: "#2a3430", mediaDark: "#1b2622", pinLabel: "#edf4f0",
  placeholderGold: "194 174 105", placeholderMint: "81 133 119", placeholderStart: "#2c4139", placeholderMid: "#34463e", placeholderEnd: "#263a33",
  placeholderGlaze: "242 248 244", placeholderBlue: "93 137 176", placeholderTexture: "150 184 171", placeholderOrb: "225 205 136", placeholderRibbon: "73 128 111",
  mapLoadingStart: "#25332d", mapLoadingMid: "#303d37", mapLoadingEnd: "#22302a", mapPlaceholderTop: "189 171 105", mapPlaceholderStart: "#506d62", mapPlaceholderMid: "#354f46", mapPlaceholderEnd: "#1b2622", mapPlaceholderAccent: "82 137 165", placeholderShadowRgb: "0 0 0", dateShadowRgb: "0 0 0",
  shadowRgb: "0 0 0", navigationShadowRgb: "0 0 0", heroShadeRgb: "5 8 7", mediaShadeRgb: "5 8 7", favoriteOverlayRgb: "5 8 7", userLocationShadowRgb: "51 106 184", selectedPinShadowRgb: "145 196 55", pinShadowRgb: "0 0 0",
};

const MUSEUM_BLUE: ThemePalette = {
  bg: "#f3f6fa", surface: "#ffffff", surfaceSoft: "#e8eef6", text: "#152338", dim: "#5f6f84", muted: "#8b98a8", border: "#d8e1ec",
  accent: "#245fa8", accentStrong: "#17457d", accentSoft: "#e0ecfa", accentContrast: "#ffffff", onDark: "#ffffff",
  emphasis: "#9acb3d", emphasisStrong: "#36540f", emphasisSoft: "#f0f7df",
  favoritePin: "#dc6698", favoritePinStrong: "#6c2040", mapPin: "#44566b", userLocation: "#1677df",
  favorite: "#a76d00", favoriteSoft: "#fff0c4", favoriteText: "#7e5100", success: "#17734f", successSoft: "#dff5ea", danger: "#c9344d", dangerSoft: "#ffeaee",
  dateText: "#1a2940", dateSubtle: "#40516a", controlTrack: "#e1e8f1", bodyCopy: "#495a70", calendarPast: "#c2ccd9", trayHandle: "#bac6d4",
  debugBg: "#17263a", debugText: "#eff5fb", debugCode: "#ffd674", debugDim: "#9baabd",
  mediaBlank: "#e3e9f1", mediaDark: "#2d4057", pinLabel: "#1d2b3e",
  placeholderGold: "231 208 143", placeholderMint: "166 205 211", placeholderStart: "#dceaf2", placeholderMid: "#eef3f8", placeholderEnd: "#dae4ee",
  placeholderGlaze: "255 255 255", placeholderBlue: "128 169 211", placeholderTexture: "53 78 110", placeholderOrb: "255 244 207", placeholderRibbon: "109 167 180",
  mapLoadingStart: "#dfe7ef", mapLoadingMid: "#f0f4f8", mapLoadingEnd: "#d8e2ec", mapPlaceholderTop: "229 205 139", mapPlaceholderStart: "#7f9caf", mapPlaceholderMid: "#506d82", mapPlaceholderEnd: "#2d4057", mapPlaceholderAccent: "91 148 184", placeholderShadowRgb: "36 69 105", dateShadowRgb: "16 28 43",
  shadowRgb: "20 36 58", navigationShadowRgb: "17 31 50", heroShadeRgb: "12 22 36", mediaShadeRgb: "13 24 39", favoriteOverlayRgb: "16 24 36", userLocationShadowRgb: "22 88 168", selectedPinShadowRgb: "107 147 30", pinShadowRgb: "0 0 0",
};

const SUNLIT_AMBER: ThemePalette = {
  bg: "#faf5e9", surface: "#fffdf8", surfaceSoft: "#f1e9d8", text: "#282218", dim: "#736856", muted: "#9b917f", border: "#e5dcc8",
  accent: "#91630b", accentStrong: "#694600", accentSoft: "#f8e8b8", accentContrast: "#ffffff", onDark: "#ffffff",
  emphasis: "#248276", emphasisStrong: "#0b554e", emphasisSoft: "#dff3ed",
  favoritePin: "#df6d9c", favoritePinStrong: "#67213e", mapPin: "#5c574c", userLocation: "#2877cf",
  favorite: "#a96800", favoriteSoft: "#ffefbe", favoriteText: "#7b4b00", success: "#28744f", successSoft: "#e0f3e8", danger: "#c83a4f", dangerSoft: "#ffe9ed",
  dateText: "#2b251b", dateSubtle: "#50493d", controlTrack: "#eee5d3", bodyCopy: "#5d5548", calendarPast: "#cbc2b0", trayHandle: "#c3b9a5",
  debugBg: "#2d2921", debugText: "#fff9ec", debugCode: "#f2d779", debugDim: "#b7ae9c",
  mediaBlank: "#eee6d6", mediaDark: "#484238", pinLabel: "#29251d",
  placeholderGold: "232 205 126", placeholderMint: "167 205 188", placeholderStart: "#e8e4cf", placeholderMid: "#f7f1df", placeholderEnd: "#e5dfce",
  placeholderGlaze: "255 255 255", placeholderBlue: "151 185 199", placeholderTexture: "76 78 68", placeholderOrb: "255 241 190", placeholderRibbon: "132 181 157",
  mapLoadingStart: "#e8e1d3", mapLoadingMid: "#f7f3ea", mapLoadingEnd: "#e3dccd", mapPlaceholderTop: "231 205 128", mapPlaceholderStart: "#999274", mapPlaceholderMid: "#6d6c58", mapPlaceholderEnd: "#484238", mapPlaceholderAccent: "107 151 163", placeholderShadowRgb: "80 65 37", dateShadowRgb: "42 34 21",
  shadowRgb: "49 39 23", navigationShadowRgb: "45 35 20", heroShadeRgb: "35 29 19", mediaShadeRgb: "32 28 21", favoriteOverlayRgb: "25 22 17", userLocationShadowRgb: "29 83 143", selectedPinShadowRgb: "27 111 101", pinShadowRgb: "0 0 0",
};

export const THEMES = {
  "city-sage": { id: "city-sage", label: "City Sage", colorScheme: "light", variables: createVariables(CITY_SAGE) },
  "night-market": { id: "night-market", label: "Night Market", colorScheme: "dark", variables: createVariables(NIGHT_MARKET) },
  "museum-blue": { id: "museum-blue", label: "Museum Blue", colorScheme: "light", variables: createVariables(MUSEUM_BLUE) },
  "sunlit-amber": { id: "sunlit-amber", label: "Sunlit Amber", colorScheme: "light", variables: createVariables(SUNLIT_AMBER) },
} as const satisfies Record<ThemeId, {
  id: ThemeId;
  label: string;
  colorScheme: "light" | "dark";
  variables: Record<`--${string}`, string>;
}>;

export const DEFAULT_THEME_ID: ThemeId = "museum-blue";
export const THEME_OPTIONS = Object.values(THEMES);

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(THEMES, value);
}

export function applyTheme(themeId: ThemeId, target?: HTMLElement): void {
  const element = target ?? (typeof document === "undefined" ? undefined : document.documentElement);
  if (!element) return;
  const theme = THEMES[themeId];
  for (const [property, value] of Object.entries(theme.variables)) {
    element.style.setProperty(property, value);
  }
  element.style.colorScheme = theme.colorScheme;
  element.dataset.appTheme = themeId;
}
