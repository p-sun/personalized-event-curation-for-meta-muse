import { describe, expect, test } from "bun:test";
import {
adjacentTrayPosition,
advanceTrayContentGesture,
beginOwnedTrayDrag,
beginTrayContentGesture,
clampTrayHeight,
DEFAULT_TRAY_POSITIONS,
isScrollAtTop,
moveOwnedTrayDrag,
nearestTrayPosition,
releaseTrayContentGesture,
releaseTrayPosition,
resolveTrayGestureMode,
shouldAdoptTrayViewportHeight,
shouldBeginTopEdgeTrayDrag,
trayHeightBelowViewportBoundary,
trayIsMovable,
traySnapHeight,
traySnapPoints,
type TraySnapDefinition,
} from "./trayPhysics";

const snaps = traySnapPoints(800);
const optionAPositions: readonly TraySnapDefinition[] = [
  { id: "middle", viewportFraction: 0.35 },
];
const optionASnaps = traySnapPoints(800, optionAPositions);
const optionCPositions: readonly TraySnapDefinition[] = [
  { id: "middle", viewportFraction: 0.4 },
  { id: "full", viewportFraction: 0.95 },
];
const optionCSnaps = traySnapPoints(800, optionCPositions);

describe("tray physics", () => {
  test("holds the tray height when a focused search opens the software keyboard", () => {
    expect(shouldAdoptTrayViewportHeight(800, 480, true)).toBe(false);
    expect(shouldAdoptTrayViewportHeight(480, 800, true)).toBe(true);
    expect(shouldAdoptTrayViewportHeight(800, 600, false)).toBe(true);
  });

  test("search focus raises the tray without lowering an already taller tray", () => {
    expect(trayHeightBelowViewportBoundary(800, 180, 320, snaps)).toBe(620);
    expect(trayHeightBelowViewportBoundary(800, 180, 700, snaps)).toBe(700);
    expect(trayHeightBelowViewportBoundary(800, 20, 320, snaps)).toBe(760);
  });

  test("defines only the 40% and 95% content-height detents by default", () => {
    expect(snaps).toEqual([
      { id: "middle", height: 320 },
      { id: "full", height: 760 },
    ]);
    expect(DEFAULT_TRAY_POSITIONS).toEqual(optionCPositions);
  });

  test("treats negative overscroll and fractional residue as the top boundary", () => {
    expect(isScrollAtTop(-18)).toBe(true);
    expect(isScrollAtTop(-0.01)).toBe(true);
    expect(isScrollAtTop(0)).toBe(true);
    expect(isScrollAtTop(0.4)).toBe(true);
    expect(isScrollAtTop(0.51)).toBe(false);
  });

  test("only a downward touch that starts at the tolerant top boundary belongs to the tray", () => {
    for (const topValue of [-18, -0.01, 0, 0.4]) {
      expect(shouldBeginTopEdgeTrayDrag(topValue, 4)).toBe(false);
      expect(shouldBeginTopEdgeTrayDrag(topValue, 5)).toBe(true);
      expect(shouldBeginTopEdgeTrayDrag(topValue, 200)).toBe(true);
    }
    expect(shouldBeginTopEdgeTrayDrag(0.51, 200)).toBe(false);
    expect(shouldBeginTopEdgeTrayDrag(20, 200)).toBe(false);
    expect(shouldBeginTopEdgeTrayDrag(0, 0)).toBe(false);
    expect(shouldBeginTopEdgeTrayDrag(0, -100)).toBe(false);
  });

  test("locks each gesture to native scroll or sheet ownership after the threshold", () => {
    expect(resolveTrayGestureMode("undecided", 0, 7)).toBe("undecided");
    expect(resolveTrayGestureMode("undecided", 0, -8)).toBe("scroll");
    expect(resolveTrayGestureMode("undecided", 30, 8)).toBe("scroll");
    expect(resolveTrayGestureMode("undecided", 0, 8)).toBe("sheet");
    expect(resolveTrayGestureMode("undecided", -12, 8)).toBe("sheet");

    // Reaching the top after native scrolling has started never hands that
    // in-flight gesture to the sheet.
    expect(resolveTrayGestureMode("scroll", 0, 120)).toBe("scroll");
    expect(resolveTrayGestureMode("sheet", 200, -120)).toBe("sheet");
  });

  test("a new gesture after a top hit or card tap starts undecided again", () => {
    const decideFreshGesture = (scrollTop: number, dy: number) => (
      resolveTrayGestureMode("undecided", scrollTop, dy)
    );
    expect(decideFreshGesture(0, -40)).toBe("scroll");
    expect(decideFreshGesture(0, -40)).toBe("scroll");
    expect(decideFreshGesture(120, -40)).toBe("scroll");
  });

  test("an owned top-edge drag follows a 200-point downward pull through release", () => {
    let drag = beginOwnedTrayDrag(760, 100);
    drag = moveOwnedTrayDrag(drag, 300, snaps);
    expect(drag.currentHeight).toBe(560);
  });

  test("a 95% top-edge pull tracks every frame and releases to 40% without a truncated bounce", () => {
    let gesture = beginTrayContentGesture(760, 100, 0);

    // The first few points intentionally stay inside the direction threshold.
    // Losing the touch to native rubber-band here was the device bug: the tray
    // moved a few pixels, stopped receiving moves, then released near 95%.
    gesture = advanceTrayContentGesture(gesture, 104, 8, -0.25, snaps);
    expect(gesture.mode).toBe("undecided");
    expect(gesture.sheetDrag).toBeNull();

    const trackedFrames = [
      { y: 108, time: 16, expectedHeight: 752 },
      { y: 180, time: 80, expectedHeight: 680 },
      { y: 260, time: 160, expectedHeight: 600 },
      { y: 340, time: 240, expectedHeight: 520 },
    ] as const;
    for (const frame of trackedFrames) {
      gesture = advanceTrayContentGesture(gesture, frame.y, frame.time, -0.25, snaps);
      expect(gesture.mode).toBe("sheet");
      expect(gesture.sheetDrag?.currentHeight).toBe(frame.expectedHeight);
    }

    const released = releaseTrayContentGesture(gesture, snaps);
    expect(released).toEqual({
      heightAtRelease: 520,
      position: "middle",
      velocityPxPerMs: expect.any(Number),
    });
  });

  test("an owned top-edge drag keeps tracking when it reverses before release", () => {
    let drag = beginOwnedTrayDrag(760, 100);
    drag = moveOwnedTrayDrag(drag, 300, snaps);
    drag = moveOwnedTrayDrag(drag, 220, snaps);
    expect(drag.currentHeight).toBe(640);
  });

  test("repeated top-edge pulls keep the same tray instance and release path coherent", () => {
    const tray = {
      height: traySnapHeight(snaps, "middle"),
      drag(fromY: number, pointerYs: readonly number[]) {
        let drag = beginOwnedTrayDrag(this.height, fromY);
        for (const pointerY of pointerYs) drag = moveOwnedTrayDrag(drag, pointerY, snaps);
        const heightAtRelease = drag.currentHeight;
        const settledPosition = releaseTrayPosition(heightAtRelease, 0, snaps);
        this.height = traySnapHeight(snaps, settledPosition);
        return { heightAtRelease, settledPosition };
      },
    };

    expect(tray.drag(540, [100])).toEqual({ heightAtRelease: 760, settledPosition: "full" });
    expect(tray.height).toBe(760);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(tray.drag(100, [300])).toEqual({ heightAtRelease: 560, settledPosition: "full" });
      expect(tray.height).toBe(760);
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(tray.drag(100, [300, 220])).toEqual({ heightAtRelease: 640, settledPosition: "full" });
      expect(tray.height).toBe(760);
    }
  });

  test("accepts view-specific snap positions as configuration", () => {
    expect(optionASnaps).toEqual([{ id: "middle", height: 280 }]);
    expect(clampTrayHeight(0, optionASnaps)).toBe(280);
    expect(clampTrayHeight(760, optionASnaps)).toBe(280);
    expect(adjacentTrayPosition("middle", "down", optionASnaps)).toBe("middle");
    expect(adjacentTrayPosition("middle", "up", optionASnaps)).toBe("middle");
    expect(trayIsMovable(optionAPositions)).toBe(false);
    expect(trayIsMovable(DEFAULT_TRAY_POSITIONS)).toBe(true);
  });

  test("supports Option C's 40%-screen and 95%-screen detents", () => {
    expect(optionCSnaps).toEqual([
      { id: "middle", height: 320 },
      { id: "full", height: 760 },
    ]);
    expect(clampTrayHeight(0, optionCSnaps)).toBe(320);
    expect(adjacentTrayPosition("middle", "down", optionCSnaps)).toBe("middle");
    expect(adjacentTrayPosition("middle", "up", optionCSnaps)).toBe("full");
    expect(trayIsMovable(optionCPositions)).toBe(true);
  });

  test("clamps free dragging to the configured outer detents", () => {
    expect(clampTrayHeight(-20, snaps)).toBe(320);
    expect(clampTrayHeight(920, snaps)).toBe(760);
  });

  test("slow releases settle at the nearest projected detent", () => {
    expect(releaseTrayPosition(365, 0.05, snaps)).toBe("middle");
    expect(releaseTrayPosition(610, 0, snaps)).toBe("full");
  });

  test("a fling advances one configured detent in its direction", () => {
    expect(releaseTrayPosition(390, 0.8, snaps)).toBe("full");
    expect(releaseTrayPosition(610, -0.8, snaps)).toBe("middle");
  });

  test("keyboard navigation is constrained to configured detents", () => {
    expect(adjacentTrayPosition("middle", "up", snaps)).toBe("full");
    expect(adjacentTrayPosition("full", "up", snaps)).toBe("full");
    expect(adjacentTrayPosition("middle", "down", snaps)).toBe("middle");
    expect(adjacentTrayPosition("full", "down", snaps)).toBe("middle");
    expect(nearestTrayPosition(398, snaps)).toBe("middle");
  });
});
