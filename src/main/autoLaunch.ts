import { app } from "electron";

export function applyLaunchAtLogin(enabled: boolean): void {
  if (!app.isPackaged) return; // dev builds would register the electron binary
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ["--hidden"] });
  } catch (err) {
    console.warn("setLoginItemSettings failed", err);
  }
}
