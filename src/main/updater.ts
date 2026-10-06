/**
 * Auto-update through GitHub Releases (electron-updater). The repository is
 * private, so an optional read-only token can be stored (encrypted with
 * safeStorage) for the update feed; a public repo needs none. Updates download
 * in the background and install when the app quits, or on demand.
 */
import { app, safeStorage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import type { UpdateStatus } from "@shared/types";
import { getState } from "./store";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let status: UpdateStatus = { state: "idle", currentVersion: app.getVersion(), hasToken: false };
let notify: ((s: UpdateStatus) => void) | null = null;
let timer: NodeJS.Timeout | null = null;
let wired = false;

function tokenPath(): string {
  return path.join(app.getPath("userData"), "update-token.bin");
}

async function readToken(): Promise<string> {
  try {
    const buf = await fs.readFile(tokenPath());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
  } catch {
    return "";
  }
}

function set(patch: Partial<UpdateStatus>): UpdateStatus {
  status = { ...status, ...patch };
  notify?.(status);
  return status;
}

function wire(): void {
  if (wired) return;
  wired = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.on("checking-for-update", () => set({ state: "checking", error: undefined }));
  autoUpdater.on("update-available", (info) => set({ state: "downloading", version: info.version, percent: 0 }));
  autoUpdater.on("update-not-available", () => set({ state: "up-to-date", checkedAt: new Date().toISOString() }));
  autoUpdater.on("download-progress", (p) => set({ state: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => set({ state: "ready", version: info.version, percent: 100 }));
  autoUpdater.on("error", (err) => set({ state: "error", error: err?.message ?? String(err) }));
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export async function initUpdater(onChange: (s: UpdateStatus) => void): Promise<void> {
  notify = onChange;
  status.hasToken = Boolean(await readToken());
  if (!app.isPackaged || app.getVersion().includes("-")) {
    set({ state: "disabled", error: "Preview and development builds are updated manually; their saved setup is kept." });
    return;
  }
  wire();
  schedule();
}

function schedule(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (!app.isPackaged || app.getVersion().includes("-") || !getState().settings.autoUpdate) return;
  setTimeout(() => void checkForUpdates(false), 15_000);
  timer = setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS);
}

export async function checkForUpdates(manual: boolean): Promise<UpdateStatus> {
  if (!app.isPackaged || app.getVersion().includes("-")) return set({ state: "disabled", error: "Preview and development builds are updated manually; their saved setup is kept." });
  if (!manual && !getState().settings.autoUpdate) return status;
  wire();
  const token = await readToken();
  autoUpdater.requestHeaders = token ? { Authorization: `token ${token}` } : {};
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    set({ state: "error", error: err instanceof Error ? err.message : String(err) });
  }
  return status;
}

export async function installUpdate(): Promise<void> {
  if (status.state !== "ready") return;
  (global as { __quitting?: boolean }).__quitting = true;
  autoUpdater.quitAndInstall(false, true);
}

export async function setUpdateToken(token: string): Promise<UpdateStatus> {
  const t = token.trim();
  if (!t) {
    await fs.rm(tokenPath(), { force: true }).catch(() => undefined);
    return set({ hasToken: false });
  }
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from(t, "utf8");
  await fs.writeFile(tokenPath(), data);
  return set({ hasToken: true });
}

/** Re-read the autoUpdate setting after a settings change. */
export function rescheduleUpdates(): void {
  schedule();
}
