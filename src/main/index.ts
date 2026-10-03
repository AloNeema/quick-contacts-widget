import { app, BrowserWindow } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { loadState } from "./store";
import { handlePhotoScheme, registerPhotoScheme } from "./photos";
import { createWidgetWindow, getWidgetWindow } from "./windows";
import { createTray } from "./tray";
import { registerIpc } from "./ipc";
import { applyLaunchAtLogin } from "./autoLaunch";
import { applyHotkey, releaseHotkey } from "./hotkey";
import { initM365 } from "./m365";
import { initUpdater } from "./updater";
import { initSalesforce } from "./salesforce";
import { broadcast } from "./windows";
import { IPC } from "@shared/ipc";

registerPhotoScheme();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = getWidgetWindow() ?? createWidgetWindow();
    win.show();
    win.focus();
  });

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId("com.quickcapitalfunding.contactswidget");
    if (process.platform === "darwin") app.dock?.hide();
    app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));

    const state = await loadState();
    handlePhotoScheme();
    registerIpc();
    createTray();
    applyLaunchAtLogin(state.settings.launchAtLogin);
    createWidgetWindow({ startHidden: process.argv.includes("--hidden") });
    if (!applyHotkey(state.settings.hotkey)) console.warn("hotkey not registered:", state.settings.hotkey);
    initUpdater((s) => broadcast(IPC.updateStatusChanged, s));
    initSalesforce((s) => broadcast(IPC.sfStatusChanged, s));
    initM365({
      onStatus: (s) => broadcast(IPC.m365StatusChanged, s),
      onPresence: (p) => broadcast(IPC.presenceChanged, p),
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWidgetWindow();
    });
  });

  // Tray app: closing windows must not quit.
  app.on("window-all-closed", () => undefined);
  app.on("before-quit", () => {
    (global as { __quitting?: boolean }).__quitting = true;
  });
  app.on("will-quit", () => releaseHotkey());
}
