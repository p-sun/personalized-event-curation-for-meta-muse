import { describe, expect, test } from "bun:test";
import { dismissPopupForPointerTarget, popupPosition } from "./ui";

const uiSource = await Bun.file(new URL("./ui.tsx", import.meta.url)).text();
const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

describe("shared popup menu", () => {
  test("an outside pointer dismisses without consuming the underlying action", () => {
    const calls: string[] = [];
    const outsideTarget = {} as Node;
    const anchor = { contains: () => false };
    const menu = { contains: () => false };

    const dismissed = dismissPopupForPointerTarget(anchor, menu, outsideTarget, () => calls.push("dismiss"));
    // The same pointer/click continues to its actual target after capture-phase dismissal.
    calls.push("underlying map action");

    expect(dismissed).toBe(true);
    expect(calls).toEqual(["dismiss", "underlying map action"]);
    expect(uiSource).toContain('document.addEventListener("pointerdown", dismissFromOutsidePointer, true)');
    expect(uiSource).not.toContain("preventDefault(");
    expect(uiSource).not.toContain("stopPropagation(");
  });

  test("a pointer in either the originator or menu does not dismiss", () => {
    const anchorTarget = {} as Node;
    const menuTarget = {} as Node;
    let dismissCount = 0;
    const dismiss = () => { dismissCount += 1; };

    expect(dismissPopupForPointerTarget(
      { contains: (target: Node) => target === anchorTarget },
      { contains: () => false },
      anchorTarget,
      dismiss,
    )).toBe(false);
    expect(dismissPopupForPointerTarget(
      { contains: () => false },
      { contains: (target: Node) => target === menuTarget },
      menuTarget,
      dismiss,
    )).toBe(false);
    expect(dismissCount).toBe(0);
  });

  test("positions menu content from its originator reference", () => {
    const viewport = { width: 390, height: 844 };
    const menu = { width: 132, height: 240 };
    expect(popupPosition({ top: 8, bottom: 40, left: 12, right: 72 }, menu, viewport, "start", 7)).toEqual({
      top: 47,
      left: 12,
    });
    expect(popupPosition({ top: 8, bottom: 40, left: 12, right: 372 }, menu, viewport, "end", 8)).toEqual({
      top: 48,
      left: 240,
    });
  });

  test("keeps a wide or bottom-edge menu inside a narrow phone viewport", () => {
    const viewport = { width: 320, height: 568 };
    expect(popupPosition(
      { top: 510, bottom: 544, left: 268, right: 312 },
      { width: 304, height: 360 },
      viewport,
      "end",
      7,
    )).toEqual({
      top: 143,
      left: 8,
    });
  });

  test("clamps a menu that cannot fit on either side of its trigger", () => {
    expect(popupPosition(
      { top: 210, bottom: 244, left: -12, right: 60 },
      { width: 304, height: 552 },
      { width: 320, height: 568 },
      "start",
      7,
    )).toEqual({
      top: 8,
      left: 8,
    });
    expect(uiSource).toContain('new ResizeObserver(updatePosition)');
    expect(uiSource).toContain('window.visualViewport?.addEventListener("resize", updatePosition)');
  });

  test("one anchored-content component backs every picker without wrapping its trigger", () => {
    expect(uiSource).toContain("anchorRef: RefObject<HTMLElement | null>");
    expect(uiSource).toContain("children: ReactNode | ((props: { close: () => void }) => ReactNode)");
    expect(uiSource).not.toContain("trigger: (props:");
    expect(appSource.match(/<PopupMenu\n/g)).toHaveLength(4);
    for (const refName of ["sortMenuAnchorRef", "calendarMenuAnchorRef", "categoryMenuAnchorRef", "settingsMenuAnchorRef"]) {
      expect(appSource).toContain(`anchorRef={${refName}}`);
    }
    expect(appSource).toContain('className={`popup-menu-trigger calendar-choice ${calendarSelected ? "active" : ""}`}');
  });
});
