import { describe, expect, test } from "bun:test";
import { igMentionCounterLabel, shouldShowIgMentionCounter } from "./igMentionCounter";

const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

describe("Instagram mention counter", () => {
  test("formats zero and plural mentions", () => {
    expect(igMentionCounterLabel(0)).toBe("0 IG mentions");
    expect(igMentionCounterLabel(4)).toBe("4 IG mentions");
  });

  test("uses singular copy for one mention", () => {
    expect(igMentionCounterLabel(1)).toBe("1 IG mention");
  });

  test("only shows a positive count when the setting is enabled", () => {
    expect(shouldShowIgMentionCounter(true, 3)).toBe(true);
    expect(shouldShowIgMentionCounter(true, 0)).toBe(false);
    expect(shouldShowIgMentionCounter(false, 3)).toBe(false);
  });

  test("aligns its trailing edge with the heart and uses symmetric corner insets", () => {
    expect(themeCss).toMatch(/\.favorite-button\s*\{[^}]*right:\s*var\(--event-header-corner-inset\)/s);
    expect(themeCss).toMatch(/\.event-header-ig-mentions\s*\{[^}]*right:\s*var\(--event-header-corner-inset\);[^}]*bottom:\s*var\(--event-header-corner-inset\)/s);
  });
});
