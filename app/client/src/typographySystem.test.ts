import { describe, expect, test } from "bun:test";

const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

const declaration = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return themeCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

describe("semantic typography and spacing", () => {
  test("bundles the UI and display variable fonts without a network import", () => {
    expect(themeCss).toContain('font-family: "Inter Variable"');
    expect(themeCss).toContain('url("./assets/inter-latin-wght-normal.woff2")');
    expect(themeCss).toContain('font-family: "Sora Variable"');
    expect(themeCss).toContain('url("./assets/sora-latin-wght-normal.woff2")');
    expect(themeCss).toContain('--font-ui: "Inter Variable"');
    expect(themeCss).toContain('--font-display: "Sora Variable"');
    expect(themeCss).not.toMatch(/@import\s+url\(https?:/);
    expect(themeCss).not.toContain('"Avenir Next"');
  });

  test("defines seven complete type roles and keeps typography independent of theme selection", () => {
    for (const role of ["display", "section", "card", "body", "secondary", "control", "caption"]) {
      for (const facet of ["size", "line", "weight", "tracking"]) {
        expect(themeCss).toContain(`--type-${role}-${facet}:`);
      }
    }

    const root = declaration(":root");
    expect(root).toContain("font-family: var(--font-ui)");
    expect(root).toContain("font-size: var(--type-body-size)");
    expect(root).toContain("font-weight: var(--type-body-weight)");
    expect(root).toContain("--ink: var(--text)");
    expect(root).toContain("--secondary: var(--dim)");
    expect(root).toContain("--tertiary: var(--muted)");
  });

  test("uses only supported weight stops", () => {
    const literalWeights = [
      ...themeCss.matchAll(/font-weight:\s*(\d+)\s*;/g),
      ...themeCss.matchAll(/font:\s*(\d+)\s+/g),
    ].map((match) => Number(match[1]));
    expect(literalWeights.filter((weight) => ![400, 500, 600, 700, 800].includes(weight))).toEqual([]);
  });

  test("uses the 4/8/12/16/24/32 spacing scale and preserves the shared 16px leading edge", () => {
    const root = declaration(":root");
    for (const [token, value] of [["1", "4px"], ["2", "8px"], ["3", "12px"], ["4", "16px"], ["6", "24px"], ["8", "32px"]]) {
      expect(root).toContain(`--space-${token}: ${value}`);
    }
    expect(root).toContain("--card-leading: var(--space-4)");
    expect(root).toContain("--date-overlay-inset: var(--card-leading)");

    const body = declaration(".event-body");
    expect(body).toContain("padding: var(--space-4) var(--card-leading)");
    const actions = declaration(".event-action-buttons");
    expect(actions).toContain("margin: var(--space-4) 0 0");
    expect(actions).not.toContain("calc(");
    expect(actions).not.toContain("translate");
  });

  test("keeps card hierarchy readable and fixes the Explore/error selector merge", () => {
    expect(declaration(".event-date-main")).toContain("font-weight: 600");
    expect(declaration(".event-body h2")).toContain("font-weight: var(--type-card-weight)");
    expect(declaration(".event-description")).toContain("font-size: var(--type-body-size)");
    expect(declaration(".event-address")).toContain("font-size: var(--type-secondary-size)");
    expect(declaration(".weekday")).toContain("font-size: var(--type-caption-size)");
    expect(declaration(".explore-card-anchor .event-address")).toContain("font-size: var(--type-caption-size)");
    expect(declaration(".error-state.primary-button")).toContain("margin-top: var(--space-4)");
    expect(themeCss).not.toMatch(/\.explore-card-anchor\s+\.error-state\.primary-button/);
  });
});
