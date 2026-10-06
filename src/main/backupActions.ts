import { app, dialog, shell } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import { backupDirectory, captureSetup, readBackup, stageRestore, writeBackup } from "./backup";
import { getState } from "./store";

let busy = false;
let backupError: string | undefined;
export function setBackupError(error: unknown): void {
  backupError = error instanceof Error ? error.message : String(error);
}
export function backupStatus() {
  return { preview: app.getVersion().includes("-"), error: backupError };
}

export async function backupAction(action: "save" | "restore" | "regular" | "folder"): Promise<{ message?: string }> {
  if (busy) throw new Error("A backup or restore is already in progress.");
  busy = true;
  try {
    const profile = app.getPath("userData");
    if (action === "folder") {
      const folder = backupDirectory(profile);
      await fs.mkdir(folder, { recursive: true });
      const error = await shell.openPath(folder);
      if (error) throw new Error(error);
      return {};
    }
    if (action === "save") {
      const picked = await dialog.showSaveDialog({
        title: "Save your contacts and setup",
        defaultPath: path.join(app.getPath("documents"), `QCF-Contacts-backup-${new Date().toISOString().slice(0, 10)}.json`),
        filters: [{ name: "QCF Contacts backup", extensions: ["json"] }],
      });
      if (picked.canceled || !picked.filePath) return {};
      const relative = path.relative(profile, picked.filePath);
      if (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)) {
        throw new Error("Choose a folder outside the app's saved-data folder, such as Documents, to protect your working setup.");
      }
      await writeBackup(picked.filePath, await captureSetup(profile, app.getVersion(), getState()));
      return { message: "Backup saved, including contacts, photos, Microsoft app IDs and Salesforce consumer key." };
    }
    let backup;
    if (action === "regular") {
      if (!app.getVersion().includes("-")) throw new Error("This option is for the preview app only.");
      const regular = path.join(app.getPath("appData"), "QCF Contacts");
      if (path.resolve(regular) === path.resolve(profile)) throw new Error("You are already using the regular profile.");
      backup = await captureSetup(regular, "regular-app");
    } else {
      const picked = await dialog.showOpenDialog({ title: "Restore a QCF Contacts backup", properties: ["openFile"], filters: [{ name: "QCF Contacts backup", extensions: ["json"] }] });
      if (picked.canceled || !picked.filePaths[0]) return {};
      backup = await readBackup(picked.filePaths[0]);
    }
    const answer = await dialog.showMessageBox({
      type: "question", title: "Restore your setup?", buttons: ["Cancel", "Restore and restart"], defaultId: 0, cancelId: 0,
      message: `Replace this app's ${getState().contacts.length} contacts with ${backup.state.contacts.length} contacts and the saved settings?`,
      detail: "Includes phone preferences, order, notes, photos, Microsoft app ID/tenant and Salesforce consumer key. Your current setup is backed up before replacement. You will need to sign in again; the Clients list will refresh after sign-in. The regular app is unchanged when importing into a preview.",
    });
    if (answer.response !== 1) return {};
    await stageRestore(profile, backup);
    setTimeout(() => { app.relaunch({ execPath: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath }); app.quit(); }, 250);
    return { message: "Restarting to restore your saved setup…" };
  } finally { busy = false; }
}
