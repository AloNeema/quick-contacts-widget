import { BrowserWindow, screen, shell } from "electron";
import path from "node:path";
import { is } from "@electron-toolkit/utils";
import { DOCK_STRIP_WIDTH, WIDGET_DEFAULT_SIZE, WIDGET_MIN_SIZE } from "@shared/defaults";
import type { WindowBounds } from "@shared/types";
import { getState, patchSettings } from "./store";
import { windowIcon } from "./icons";

let widgetWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let saveBoundsTimer: NodeJS.Timeout | null = null;
let dockExpanded = false;

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

/** Rectangle for the docked strip (or the expanded panel) hugging the chosen screen edge. */
export function dockBounds(expanded: boolean): WindowBounds {
  const { settings } = getState();
  const current = getWidgetWindow()?.getBounds();
  const display = current ? screen.getDisplayMatching(current) : screen.getPrimaryDisplay();
  const a = display.workArea;
  const height = Math.min(a.height, Math.max(WIDGET_MIN_SIZE.height, settings.dock.height ?? Math.round(a.height * 0.7)));
  const y = Math.min(a.y + a.height - height, Math.max(a.y, settings.dock.y ?? a.y + Math.round((a.height - height) / 2)));
  const width = expanded
    ? Math.min(a.width, Math.max(WIDGET_MIN_SIZE.width, settings.dock.width ?? settings.bounds?.width ?? WIDGET_DEFAULT_SIZE.width))
    : DOCK_STRIP_WIDTH;
  const x = settings.dock.side === "right" ? a.x + a.width - width : a.x;
  return { x, y, width, height };
}

export function applyDockLayout(expanded = dockExpanded): void {
  const win = getWidgetWindow();
  if (!win) return;
  const { settings } = getState();
  dockExpanded = expanded;
  if (settings.dock.enabled) {
    win.setBounds(dockBounds(expanded));
    win.setAlwaysOnTop(true, "normal");
  } else {
    win.setBounds(sanitizeBounds(settings.bounds));
    win.setAlwaysOnTop(settings.alwaysOnTop, "normal");
  }
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
  const bounds = settings.dock.enabled ? dockBounds(false) : sanitizeBounds(settings.bounds);

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
    alwaysOnTop: settings.alwaysOnTop || settings.dock.enabled,
    title: "QCF Contacts",
    icon: windowIcon(),
    ...(settings.appearance.acrylic && process.platform === "win32" ? { backgroundMaterial: "acrylic" as const } : {}),
    ...(settings.appearance.acrylic && process.platform === "darwin"
      ? { vibrancy: (settings.appearance.theme === "light" ? "popover" : "hud") as "popover" | "hud", visualEffectState: "active" as const }
      : {}),
    ...(process.platform === "darwin" ? { titleBarStyle: "customButtonsOnHover" as const } : {}),
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
      const { settings: s } = getState();
      if (s.dock.enabled) {
        // Docked: vertical placement, height and (when expanded) the panel width are user-adjustable.
        const b = w.getBounds();
        void patchSettings({ dock: { ...s.dock, y: b.y, height: b.height, ...(dockExpanded ? { width: b.width } : {}) } });
        return;
      }
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
  const { dock } = getState().settings;
  if (dock.enabled) {
    // Docked: the panel stays anchored to its screen edge. Height always changes; width only while
    // expanded (the collapsed strip has a fixed width). On the right edge, dragging left widens it.
    const a = screen.getDisplayMatching(b).workArea;
    const height = Math.min(Math.max(WIDGET_MIN_SIZE.height, b.height + dy), a.height);
    const grow = dock.side === "right" ? -dx : dx;
    const width = dockExpanded ? Math.min(Math.max(WIDGET_MIN_SIZE.width, b.width + grow), a.width) : b.width;
    const x = dock.side === "right" ? a.x + a.width - width : a.x;
    win.setBounds({ x, y: b.y, width, height });
    return;
  }
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
    icon: windowIcon(),
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
