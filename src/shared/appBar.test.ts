import { describe, expect, it } from "vitest";
import { proposedBand, settleBand, xAgainstBand } from "./appBar";

const display = { left: 0, top: 0, right: 1920, bottom: 1080 };

describe("dock app bar geometry", () => {
  it("proposes a full-height band on the dock's side", () => {
    expect(proposedBand(display, "right", 95)).toEqual({ left: 1825, top: 0, right: 1920, bottom: 1080 });
    expect(proposedBand(display, "left", 95)).toEqual({ left: 0, top: 0, right: 95, bottom: 1080 });
  });
  it("keeps the edge Windows chose (e.g. a right-side taskbar) and restores the width", () => {
    // Taskbar already takes 60px on the right: Windows moves the proposal in.
    expect(settleBand({ left: 1825, top: 0, right: 1860, bottom: 1080 }, "right", 95)).toEqual({ left: 1765, top: 0, right: 1860, bottom: 1080 });
    expect(settleBand({ left: 60, top: 0, right: 95, bottom: 1080 }, "left", 95)).toEqual({ left: 60, top: 0, right: 155, bottom: 1080 });
  });
  it("places the strip or the expanded panel against the band's outer edge", () => {
    const band = { left: 1765, top: 0, right: 1860, bottom: 1080 };
    expect(xAgainstBand(band, "right", 76)).toBe(1784);
    expect(xAgainstBand(band, "right", 340)).toBe(1520);
    expect(xAgainstBand({ left: 60, top: 0, right: 155, bottom: 1080 }, "left", 340)).toBe(60);
  });
  it("works on a second monitor with negative coordinates", () => {
    expect(proposedBand({ left: -1920, top: 0, right: 0, bottom: 1080 }, "left", 95)).toEqual({ left: -1920, top: 0, right: -1825, bottom: 1080 });
  });
});
