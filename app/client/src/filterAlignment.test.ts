import { describe, expect, test } from "bun:test";
import { nearestMeasurableContainerInnerWidth, shouldFullyAlignFilterRow } from "./filterAlignment";

describe("adaptive filter alignment", () => {
  test("skips a display-contents wrapper with no layout box when measuring the date selector container", () => {
    const layoutContainer = { clientWidth: 360, parentElement: null };
    const displayContentsWrapper = { clientWidth: 0, parentElement: layoutContainer };
    const row = { clientWidth: 281, parentElement: displayContentsWrapper } as unknown as HTMLElement;

    expect(nearestMeasurableContainerInnerWidth(row)).toBe(360);
    expect(shouldFullyAlignFilterRow(
      nearestMeasurableContainerInnerWidth(row),
      [72, 202],
      7,
    )).toBe(true);
  });

  test("fully aligns when the left-aligned controls leave at most 25% of the container inner width unused", () => {
    expect(shouldFullyAlignFilterRow(400, [75, 65, 60, 80], 10)).toBe(true);
    expect(shouldFullyAlignFilterRow(400, [65, 60, 55, 80], 10)).toBe(false);
  });

  test("stays left-aligned when the controls would wrap", () => {
    expect(shouldFullyAlignFilterRow(320, [70, 65, 60, 110], 10)).toBe(false);
  });

  test("treats exactly 25% of the container inner width remaining as full alignment", () => {
    expect(shouldFullyAlignFilterRow(200, [70, 70], 10)).toBe(true);
  });
});
