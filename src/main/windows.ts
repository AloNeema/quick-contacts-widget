import { BrowserWindow, screen, shell } from "electron";
import path from "node:path";
import { is } from "@electron-toolkit/utils";
import { WIDGET_DEFAULT_SIZE, WIDGET_MIN_SIZE } from "@shared/defaults";
import type { WindowBounds } from "@shared/types";
import { getState, patchSettings } from "./store";

let widgetWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let saveBoundsTimer: NodeJS.Timeout | null = null;

function rendererUrl(hash: string): { url?: string; file?: string; hash: string } {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    return { url: `${process.env.ELECTRON_RENDERER_URL}#${hash}`, hash };
  }
  return { file: path.join(__dirname, "../renderer/index.html"), hash };
}

function load(win: BrowserWindow, hash: string): void {
  const target = rendererUrl(hash);
  if (target.url) void win.loadURL(target.url);
  else void win.loadFile(target.file!, { hash });
}

/** Keep the saved rectangle on a connected display; otherwise park it near the primary display's top-right. */
export function sanitizeBounds(saved: WindowBounds | undefined): WindowBounds {
  const displays = screen.getAllDisplays();
  const width = Math.max(WIDGET_MIN_SIZE.width, saved?.width ?? WIDGET_DEFAULT_SIZE.width);
  const height = Math.max(WIDGET_MIN_SIZE.height, saved?.height ?? WIDGET_DEFAULT_SIZE.height);
  if (saved) {
    const cx = saved.x + width / 2;
    const cy = saved.y + 40;
    const onScreen = displays.some((d) => {
      const a = d.workArea;
      return cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height;
    });
    if (onScreen) return { x: saved.x, y: saved.y, width, height };
  }
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - width - 24, y: a.y + 24, width, height };
}

export function getWidgetWindow(): BrowserWindow | null {
  return widgetWindow && !widgetWindow.isDestroyed() ? widgetWindow : null;
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null;
}

export function createWidgetWindow(opts: { startHidden?: boolean } = {}): BrowserWindow {
  const existing = getWidgetWindow();
  if (existing) return existing;
  const { settings } = getState();
  const bounds = sanitizeBounds(settings.bounds);

  const win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    roundedCorners: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    title: "QCF Contacts",
    ...(settings.appearance.acrylic && process.platform === "win32" ? { backgroundMaterial: "acrylic" as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  widgetWindow = win;

  if (settings.alwaysOnTop) win.setAlwaysOnTop(true, "normal");
  win.setMenuBarVisibility(false);

  const persistBounds = () => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      const w = getWidgetWindow();
      if (!w) return;
      void patchSettings({ bounds: w.getBounds() });
    }, 400);
  };
  win.on("moved", persistBounds);
  win.on("resized", persistBounds);
  win.on("resize", persistBounds);

  // Closing the widget hides it; the tray keeps the app alive.
  win.on("close", (e) => {
    if (!(global as { __quitting?: boolean }).__quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.once("ready-to-show", () => {
    if (!opts.startHidden) win.show();
  });
  load(win, "/widget");
  return win;
}

export function recreateWidgetWindow(): void {
  const current = getWidgetWindow();
  const wasVisible = current?.isVisible() ?? true;
  if (current) {
    (global as { __quitting?: boolean }).__quitting = true;
    current.close();
    (global as { __quitting?: boolean }).__quitting = false;
    widgetWindow = null;
  }
  createWidgetWindow({ startHidden: !wasVisible });
}

export function toggleWidgetVisibility(): void {
  const win = getWidgetWindow() ?? createWidgetWindow();
  if (win.isVisible()) win.hide();
  else {
    win.show();
    win.focus();
  }
}

export function resizeWidgetBy(dx: number, dy: number): void {
  const win = getWidgetWindow();
  if (!win) return;
  const b = win.getBounds();
  const display = screen.getDisplayMatching(b).workArea;
  const width = Math.min(Math.max(WIDGET_MIN_SIZE.width, b.width + dx), display.width);
  const height = Math.min(Math.max(WIDGET_MIN_SIZE.height, b.height + dy), display.height);
  win.setBounds({ x: b.x, y: b.y, width, height });
}

export function createSettingsWindow(tab?: string): BrowserWindow {
  const existing = getSettingsWindow();
  const hash = `/settings${tab ? `/${tab}` : ""}`;
  if (existing) {
    existing.show();
    existing.focus();
    void existing.webContents.executeJavaScript(`location.hash = ${JSON.stringify("#" + hash)}`).catch(() => undefined);
    return existing;
  }
  const { settings } = getState();
  const win = new BrowserWindow({
    width: 880,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: "QCF Contacts – Settings",
    autoHideMenuBar: true,
    backgroundColor: settings.appearance.theme === "light" ? "#f6f7fb" : "#0f1115",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });
  settingsWindow = win;
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    settingsWindow = null;
  });
  load(win, hash);
  return win;
}

export function broadcast(channel: string, payload: unknown): void {
  for (const win of [getWidgetWindow(), getSettingsWindow()]) {
    if (win && !win.webContents.isDestroyed()) win.webContents.send(channel, payload);
  }
}
