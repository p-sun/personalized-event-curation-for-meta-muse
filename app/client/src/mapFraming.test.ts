import { describe, expect, test } from "bun:test";
import { visibleMapFrame } from "./mapFraming";

const mapRect = { top: 100, right: 400, bottom: 700, left: 0, width: 400, height: 600 };

describe("visible map framing", () => {
  test("uses the whole map when no tray overlaps it", () => {
    expect(visibleMapFrame(mapRect)).toEqual({
      visibleHeight: 600,
      bottomOcclusion: 0,
      centerOffsetY: 0,
      paddingTopLeft: [38, 38],
      paddingBottomRight: [38, 38],
    });
  });

  test("ends the visible map at the top of an overlapping events tray", () => {
    expect(visibleMapFrame(mapRect, {
      top: 460,
      right: 400,
      bottom: 800,
      left: 0,
      width: 400,
      height: 340,
    })).toEqual({
      visibleHeight: 360,
      bottomOcclusion: 240,
      centerOffsetY: 120,
      paddingTopLeft: [38, 38],
      paddingBottomRight: [38, 278],
    });
  });

  test("ignores a tray that does not overlap the map", () => {
    expect(visibleMapFrame(mapRect, {
      top: 460,
      right: 900,
      bottom: 800,
      left: 500,
      width: 400,
      height: 340,
    }).bottomOcclusion).toBe(0);
  });
});
