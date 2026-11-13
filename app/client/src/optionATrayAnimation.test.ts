import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const uiSource = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();
const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

describe("reusable view presence animation", () => {
  test("keeps an exiting view mounted through one shared helper", () => {
    expect(uiSource).toContain("export function usePresenceTransition(");
    expect(uiSource).toContain("const exiting = mounted && !visible");
    expect(uiSource).toContain("event.animationName === exitAnimationName");
    expect(uiSource).toContain("exitDurationMs + 70");

    expect(appSource).toContain("const mapTransition = usePresenceTransition(mapVisible");
    expect(appSource).toContain('exitAnimationName: "ui-slide-from-bottom-exit"');
    expect(appSource).toContain("const mapPresented = mapTransition.mounted");
    expect(appSource).toContain("onAnimationEnd={mapTransition.onAnimationEnd}");
    expect(appSource).toContain('mapTransition.exiting ? "is-exiting" : ""');
    expect(appSource).not.toContain("mapClosing");
  });

  test("uses reusable enter and exit classes with an ease-out close", () => {
    const exitRule = themeCss.match(/\.ui-slide-from-bottom\.is-exiting\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(themeCss).toContain("@keyframes ui-slide-from-bottom-enter");
    expect(themeCss).toContain("@keyframes ui-slide-from-bottom-exit");
    expect(exitRule).toContain("pointer-events: none");
    expect(exitRule).toContain(
      "animation: ui-slide-from-bottom-exit .38s cubic-bezier(.22, 1, .36, 1) both",
    );
  });

  test("does not suppress the transition for reduced-motion preferences", () => {
    expect(themeCss).not.toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.ui-slide-from-bottom\s*\{[^}]*animation:\s*none/s,
    );
  });

  test("keeps every box outside the rounded tray surface paint-free", () => {
    const trayRule = themeCss.match(/\.feed-map-tray\s*\{([^}]*)\}/)?.[1] ?? "";
    const surfaceRule = themeCss.match(/\.modal-tray-surface\s*\{([^}]*)\}/)?.[1] ?? "";
    const mapRule = themeCss.match(/\.feed-tray-map-canvas\s*\{([^}]*)\}/)?.[1] ?? "";

    // The outer tray is square and owns the slide transform. Any background on
    // it is visible through the rounded surface's transparent corner pixels.
    expect(trayRule).not.toContain("background:");
    expect(trayRule).not.toContain("box-shadow:");
    expect(surfaceRule).toContain("overflow: hidden");
    expect(surfaceRule).toContain("border-radius: 24px 24px 0 0");
    expect(surfaceRule).toContain("background: var(--bg)");
    expect(surfaceRule).toContain("box-shadow: var(--tray-outer-shadow)");
    expect(mapRule).toContain("border-radius: 0");
    expect(mapRule).not.toContain("24px");
  });

  test("turns off text selection at the application root", () => {
    const rootRule = themeCss.match(/\.hatch-space-root\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rootRule).toContain("-webkit-user-select: none");
    expect(rootRule).toContain("user-select: none");
  });
});
