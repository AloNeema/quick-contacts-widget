import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { getState as loadedState, loadState } from "./store";
import { handlePhotoScheme, registerPhotoScheme } from "./photos";
import { createWidgetWindow, getWidgetWindow } from "./windows";
import { createTray } from "./tray";
import { registerIpc } from "./ipc";
import { applyLaunchAtLogin } from "./autoLaunch";
import { applyHotkey, releaseHotkey } from "./hotkey";
import { initM365 } from "./m365";
import { initUpdater } from "./updater";
import { initSalesforce } from "./salesforce";
import { refreshLogos } from "./logos";
import { initClients } from "./clients";
import { setTrayBadge } from "./tray";
import { broadcast } from "./windows";
import { IPC } from "@shared/ipc";
import { applyPendingRestore, automaticBackup } from "./backup";
import { setBackupError } from "./backupActions";

// Preview builds have their own contacts/settings so testing a new provider cannot
// make a stable build discard settings it does not yet understand.
const profileName = !app.isPackaged ? "QCF Contacts Development" : app.getVersion().includes("-") ? "QCF Contacts Preview" : "QCF Contacts";
const profileData = path.join(app.getPath("appData"), profileName);
mkdirSync(profileData, { recursive: true });
app.setPath("userData", profileData);

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

    await applyPendingRestore(app.getPath("userData"), app.getVersion());
    const state = await loadState();
    try { await automaticBackup(app.getPath("userData"), app.getVersion(), state); }
    catch (error) { setBackupError(error); }
    handlePhotoScheme();
    registerIpc();
    createTray();
    applyLaunchAtLogin(state.settings.launchAtLogin);
    createWidgetWindow({ startHidden: process.argv.includes("--hidden") });
    if (!applyHotkey(state.settings.hotkey)) console.warn("hotkey not registered:", state.settings.hotkey);
    initUpdater((s) => broadcast(IPC.updateStatusChanged, s));
    initSalesforce((s) => broadcast(IPC.sfStatusChanged, s));
    void initClients((s) => {
      broadcast(IPC.clientsChanged, s);
      setTrayBadge(s.newCount);
    });
    // Company logos in the background a few seconds after launch.
    setTimeout(() => {
      void refreshLogos()
        .then((n) => {
          if (n > 0) {
            const s = loadedState();
            broadcast(IPC.stateChanged, { settings: s.settings, contacts: s.contacts });
          }
        })
        .catch((err) => console.warn("logo refresh failed", err));
    }, 3000);
    initM365({
      onStatus: (s) => broadcast(IPC.m365StatusChanged, s),
      onPresence: (p) => broadcast(IPC.presenceChanged, p),
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWidgetWindow();
    });
  }).catch((error) => {
    dialog.showErrorBox("QCF Contacts could not load your setup", `${error instanceof Error ? error.message : String(error)}\n\nSaved files: ${app.getPath("userData")}`);
    app.quit();
  });

  // Tray app: closing windows must not quit.
  app.on("window-all-closed", () => undefined);
  app.on("before-quit", () => {
    (global as { __quitting?: boolean }).__quitting = true;
  });
  app.on("will-quit", () => { releaseHotkey(); });
}
