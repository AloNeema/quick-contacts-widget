import { app } from "electron";

export function applyLaunchAtLogin(enabled: boolean): void {
  // Preview profiles isolate saved data, but the OS startup entry is still shared
  // with the regular app. Never add, replace, or remove it from a preview.
  if (!app.isPackaged || app.getVersion().includes("-")) return;
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ["--hidden"] });
  } catch (err) {
    console.warn("setLoginItemSettings failed", err);
  }
}
