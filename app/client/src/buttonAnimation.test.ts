import { describe, expect, test } from "bun:test";

const uiSource = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();
const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();

describe("shared button tap animation", () => {
  test("every design-system button inherits the animated primitive", () => {
    expect(uiSource).toContain("export const AnimatedButton = forwardRef<HTMLButtonElement");
    expect(uiSource).toContain('className={`ui-animated-button ${className}`.trim()}');
    expect(uiSource.match(/<AnimatedButton/g)).toHaveLength(4);
    expect(uiSource.match(/<button/g)).toHaveLength(1);
  });

  test("product UI has no raw button escape hatch", () => {
    expect(appSource).toContain("StyledButton");
    expect(appSource).not.toContain("<button");
    expect(appSource).not.toContain("</button>");
  });

  test("tap feedback composes with existing transforms and honors reduced motion", () => {
    expect(themeCss).toContain(".ui-animated-button:active:not(:disabled)");
    expect(themeCss).toContain("scale: .96");
    expect(themeCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(themeCss).toContain(".ui-animated-button:active:not(:disabled) { scale: 1; }");
    expect(themeCss).not.toContain(".ui-animated-button:active:not(:disabled) { transform:");
  });
});
