import { app, Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import { getState, patchSettings } from "./store";
import { createSettingsWindow, getWidgetWindow, toggleWidgetVisibility, broadcast } from "./windows";
import { IPC } from "@shared/ipc";

let tray: Tray | null = null;

function trayIcon(): Electron.NativeImage {
  // macOS menu bar wants a monochrome "template" image that adapts to light/dark menu bars.
  const file = process.platform === "darwin" ? "trayTemplate.png" : "tray.png";
  const candidates = [path.join(process.resourcesPath ?? "", file), path.join(__dirname, "../../resources", file)];
  for (const p of candidates) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      const sized = img.resize({ width: 16, height: 16 });
      if (process.platform === "darwin") sized.setTemplateImage(true);
      return sized;
    }
  }
  return nativeImage.createEmpty();
}

export function createTray(): Tray {
  if (tray) return tray;
  tray = new Tray(trayIcon());
  tray.setToolTip("QCF Contacts");
  tray.on("double-click", () => toggleWidgetVisibility());
  tray.on("click", () => toggleWidgetVisibility());
  refreshTrayMenu();
  return tray;
}

export function refreshTrayMenu(): void {
  if (!tray) return;
  const { settings } = getState();
  const widget = getWidgetWindow();
  const menu = Menu.buildFromTemplate([
    { label: widget?.isVisible() ? "Hide widget" : "Show widget", click: () => toggleWidgetVisibility() },
    { label: "Settings…", click: () => createSettingsWindow() },
    { type: "separator" },
    {
      label: "Always on top",
      type: "checkbox",
      checked: settings.alwaysOnTop,
      click: async (item) => {
        const s = await patchSettings({ alwaysOnTop: item.checked });
        getWidgetWindow()?.setAlwaysOnTop(item.checked, "normal");
        broadcast(IPC.stateChanged, { settings: s, contacts: getState().contacts });
      },
    },
    { type: "separator" },
    { label: `Version ${app.getVersion()}`, enabled: false },
    {
      label: "Quit",
      click: () => {
        (global as { __quitting?: boolean }).__quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}
