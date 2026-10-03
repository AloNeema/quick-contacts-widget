import { globalShortcut } from "electron";
import { IPC } from "@shared/ipc";
import { createWidgetWindow, getWidgetWindow } from "./windows";

let registered = "";

/** Show the widget and put the cursor in search. Returns false when the accelerator is taken or invalid. */
export function applyHotkey(accelerator: string): boolean {
  if (registered) {
    globalShortcut.unregister(registered);
    registered = "";
  }
  const acc = accelerator.trim();
  if (!acc) return true;
  try {
    const ok = globalShortcut.register(acc, () => {
      const win = getWidgetWindow() ?? createWidgetWindow();
      if (win.isVisible() && win.isFocused()) {
        win.hide();
        return;
      }
      win.show();
      win.focus();
      win.webContents.send(IPC.focusSearch);
    });
    if (ok) registered = acc;
    return ok;
  } catch {
    return false;
  }
}

export function releaseHotkey(): void {
  globalShortcut.unregisterAll();
  registered = "";
}
