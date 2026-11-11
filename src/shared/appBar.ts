/** Screen-edge geometry for the docked strip when it reserves space like the Windows taskbar. */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type DockSide = "left" | "right";

/**
 * The band to ask Windows for: the display's full height, `width` wide, on the dock's side.
 * Windows may move it in (another app bar or the taskbar already on that edge); the caller
 * keeps the edge Windows returns and re-applies the width from it.
 */
export function proposedBand(display: Rect, side: DockSide, width: number): Rect {
  return side === "right"
    ? { left: display.right - width, top: display.top, right: display.right, bottom: display.bottom }
    : { left: display.left, top: display.top, right: display.left + width, bottom: display.bottom };
}

/** After Windows adjusts the proposal (ABM_QUERYPOS), keep its outer edge and restore the width. */
export function settleBand(queried: Rect, side: DockSide, width: number): Rect {
  return side === "right" ? { ...queried, left: queried.right - width } : { ...queried, right: queried.left + width };
}

/** The x of a window `width` wide sitting against the reserved band's outer edge. */
export function xAgainstBand(band: Rect, side: DockSide, width: number): number {
  return side === "right" ? band.right - width : band.left;
}
