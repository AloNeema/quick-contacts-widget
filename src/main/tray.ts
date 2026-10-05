import { app, Menu, Tray } from "electron";
import { trayIcon } from "./icons";
import { getState, patchSettings } from "./store";
import { createSettingsWindow, getWidgetWindow, toggleWidgetVisibility, broadcast } from "./windows";
import { IPC } from "@shared/ipc";

let tray: Tray | null = null;

export function createTray(): Tray {
  if (tray) return tray;
  tray = new Tray(trayIcon());
  tray.setToolTip("QCF Contacts");
  tray.on("double-click", () => toggleWidgetVisibility());
  tray.on("click", () => toggleWidgetVisibility());
  refreshTrayMenu();
  return tray;
}

let badge = 0;

/** New-client count: tooltip everywhere, number next to the menu-bar icon on macOS. */
export function setTrayBadge(count: number): void {
  if (count === badge) return;
  badge = count;
  if (!tray) return;
  tray.setToolTip(count ? `QCF Contacts · ${count} new client${count === 1 ? "" : "s"}` : "QCF Contacts");
  if (process.platform === "darwin") tray.setTitle(count ? ` ${count}` : "");
  refreshTrayMenu();
}

export function refreshTrayMenu(): void {
  if (!tray) return;
  const { settings } = getState();
  const widget = getWidgetWindow();
  const menu = Menu.buildFromTemplate([
    { label: widget?.isVisible() ? "Hide widget" : "Show widget", click: () => toggleWidgetVisibility() },
    { label: "Settings…", click: () => createSettingsWindow() },
    ...(badge
      ? [
          {
            label: `${badge} new client${badge === 1 ? "" : "s"}`,
            click: () => {
              const w = getWidgetWindow();
              if (w) {
                w.show();
                w.focus();
                w.webContents.send("widget:show-tab", "clients");
              }
            },
          },
        ]
      : []),
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
