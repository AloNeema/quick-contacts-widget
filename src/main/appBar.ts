/**
 * Windows "app bar": when docked, the strip reserves its screen edge the way the taskbar does,
 * so maximized and snapped windows stop where the dock begins instead of sliding underneath.
 *
 * Uses SHAppBarMessage (shell32) through koffi. Everything here is a no-op on macOS/Linux, and
 * koffi is only loaded on Windows (the macOS builds don't ship a matching native binary).
 */
import { BrowserWindow, screen } from "electron";
import { DOCK_STRIP_WIDTH } from "@shared/defaults";
import { proposedBand, settleBand, type DockSide, type Rect } from "@shared/appBar";
import type { DockSettings, WindowBounds } from "@shared/types";

const ABM_NEW = 0;
const ABM_REMOVE = 1;
const ABM_QUERYPOS = 2;
const ABM_SETPOS = 3;
const ABN_POSCHANGED = 1;
const ABN_FULLSCREENAPP = 2;
const ABE_LEFT = 0;
const ABE_RIGHT = 2;
/** WM_USER + an app-chosen offset: Windows posts app bar notifications to the strip with this id. */
const CALLBACK_MESSAGE = 0x0400 + 0x51;

interface AppBarData {
  cbSize: number;
  hWnd: number;
  uCallbackMessage: number;
  uEdge: number;
  rc: Rect;
  lParam: number;
}
type Send = (message: number, data: AppBarData) => number;

let send: Send | null | undefined;
let dataSize = 0;

async function loadShell(): Promise<Send | null> {
  if (send !== undefined) return send;
  try {
    const koffi = (await import("koffi")).default;
    const RECT = koffi.struct("QCF_RECT", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
    const APPBARDATA = koffi.struct("QCF_APPBARDATA", {
      cbSize: "uint32",
      hWnd: "uintptr_t",
      uCallbackMessage: "uint32",
      uEdge: "uint32",
      rc: RECT,
      lParam: "intptr_t",
    });
    dataSize = koffi.sizeof(APPBARDATA);
    const shell32 = koffi.load("shell32.dll");
    const fn = shell32.func("__stdcall", "SHAppBarMessage", "uintptr_t", ["uint32", koffi.inout(koffi.pointer(APPBARDATA))]);
    send = (message, data) => Number(fn(message, data));
  } catch (err) {
    console.warn("Screen-space reservation is unavailable", err);
    send = null;
  }
  return send;
}

interface Registered {
  win: BrowserWindow;
  side: DockSide;
  hWnd: number;
  /** The reserved band in physical pixels, as Windows granted it. */
  band: Rect;
  onBandChanged: () => void;
  onDisplayChange: () => void;
}
let current: Registered | null = null;

function handleOf(win: BrowserWindow): number {
  const buf = win.getNativeWindowHandle();
  return Number(buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0)));
}

function data(reg: Pick<Registered, "hWnd">, extra: Partial<AppBarData> = {}): AppBarData {
  return { cbSize: dataSize, hWnd: reg.hWnd, uCallbackMessage: CALLBACK_MESSAGE, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0, ...extra };
}

/** Ask Windows for the band on the strip's display and side; Windows resizes maximized windows to fit. */
function setPosition(reg: Registered): void {
  if (!send || reg.win.isDestroyed()) return;
  const display = screen.getDisplayMatching(reg.win.getBounds());
  const b = screen.dipToScreenRect(reg.win, display.bounds);
  const physical: Rect = { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
  const width = Math.round(DOCK_STRIP_WIDTH * display.scaleFactor);
  const query = data(reg, { uEdge: reg.side === "right" ? ABE_RIGHT : ABE_LEFT, rc: proposedBand(physical, reg.side, width) });
  send(ABM_QUERYPOS, query);
  const final = data(reg, { uEdge: query.uEdge, rc: settleBand(query.rc, reg.side, width) });
  send(ABM_SETPOS, final);
  reg.band = final.rc;
}

/** The reserved band in DIPs (what window bounds use), or null when nothing is reserved. */
export function reservedBand(): WindowBounds | null {
  if (!current || current.win.isDestroyed()) return null;
  const { left, top, right, bottom } = current.band;
  return screen.screenToDipRect(current.win, { x: left, y: top, width: right - left, height: bottom - top });
}

/**
 * Reserve (or release) the dock's edge to match the settings. Resolves true when the reserved band
 * changed, so the caller can move the strip against it.
 */
export async function syncAppBar(win: BrowserWindow, dock: DockSettings, onBandChanged: () => void): Promise<boolean> {
  const want = process.platform === "win32" && dock.enabled && dock.reserveSpace !== false;
  if (!want) return releaseAppBar();
  if (current && current.win === win && current.side === dock.side) return false;
  releaseAppBar();
  const shell = await loadShell();
  if (!shell || win.isDestroyed()) return false;
  const reg: Registered = {
    win,
    side: dock.side,
    hWnd: handleOf(win),
    band: { left: 0, top: 0, right: 0, bottom: 0 },
    onBandChanged,
    onDisplayChange: () => {
      setPosition(reg);
      reg.onBandChanged();
    },
  };
  if (!shell(ABM_NEW, data(reg))) {
    // Already registered for this window (e.g. after a reload): drop it and start clean.
    shell(ABM_REMOVE, data(reg));
    if (!shell(ABM_NEW, data(reg))) return false;
  }
  current = reg;
  win.hookWindowMessage(CALLBACK_MESSAGE, (wParam: Buffer, lParam: Buffer) => {
    const code = wParam.readUInt32LE(0);
    if (code === ABN_POSCHANGED) reg.onDisplayChange();
    // Another app went full screen (a video, a presentation): step back so the strip doesn't cover it.
    else if (code === ABN_FULLSCREENAPP && !win.isDestroyed()) win.setAlwaysOnTop(lParam.readUInt32LE(0) === 0, "normal");
  });
  screen.on("display-metrics-changed", reg.onDisplayChange);
  setPosition(reg);
  return true;
}

/** Whether the Windows shell (taskbar) is running to honour reservations; used by the CI check. */
export async function shellTaskbarPresent(): Promise<boolean> {
  const shell = await loadShell();
  return Boolean(shell && shell(5 /* ABM_GETTASKBARPOS */, data({ hWnd: 0 })));
}

/** Give the edge back to Windows. Synchronous so it also runs while the app is quitting. */
export function releaseAppBar(): boolean {
  const reg = current;
  if (!reg) return false;
  current = null;
  screen.removeListener("display-metrics-changed", reg.onDisplayChange);
  if (!reg.win.isDestroyed()) reg.win.unhookWindowMessage(CALLBACK_MESSAGE);
  send?.(ABM_REMOVE, data(reg));
  return true;
}
