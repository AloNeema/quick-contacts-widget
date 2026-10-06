import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { stateSchema } from "./store";
import type { PersistedState } from "@shared/types";

const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const imageName = z.string().max(240).regex(/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(png|jpg|jpeg|gif|webp|bmp)$/i);
const clientChoicesSchema = z.object({
  marks: z.record(z.object({ hiddenAt: z.string().optional(), notClient: z.boolean().optional() })).default({}),
  firstSeen: z.record(z.string()).default({}),
  lastViewedAt: z.string().optional(),
});
const backupSchema = z.object({
  format: z.literal("qcf-contacts-backup"),
  version: z.literal(1),
  createdAt: z.string().datetime(),
  appVersion: z.string().max(80),
  state: stateSchema,
  clientChoices: clientChoicesSchema.optional(),
  photos: z.array(z.object({ name: imageName, data: z.string().max(12 * 1024 * 1024).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) })).max(10000),
});
export type SetupBackup = z.infer<typeof backupSchema>;

export function parseBackup(raw: string): SetupBackup {
  if (Buffer.byteLength(raw) > MAX_BACKUP_BYTES) throw new Error("This backup exceeds the 100 MB limit.");
  const parsed = backupSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("This is not a supported QCF Contacts backup. Nothing was replaced.");
  const backup = parsed.data;
  if (new Set(backup.state.contacts.map(c => c.id)).size !== backup.state.contacts.length) throw new Error("The backup contains duplicate contacts.");
  if (new Set(backup.photos.map(p => p.name)).size !== backup.photos.length) throw new Error("The backup contains duplicate image names.");
  for (const c of backup.state.contacts) {
    if (c.photo?.kind === "file") imageName.parse(c.photo.fileName);
    if (c.logo) imageName.parse(c.logo.fileName);
  }
  return backup;
}

export async function readBackup(file: string): Promise<SetupBackup> {
  if ((await fs.stat(file)).size > MAX_BACKUP_BYTES) throw new Error("This backup exceeds the 100 MB limit.");
  return parseBackup(await fs.readFile(file, "utf8"));
}

// Deliberate allowlist: saved setup and referenced images only. OAuth tokens,
// updater tokens, browser cookies and password files never enter an export.
export async function captureSetup(profile: string, version: string, current?: PersistedState): Promise<SetupBackup> {
  const state = stateSchema.parse(current ?? JSON.parse(await fs.readFile(path.join(profile, "state.json"), "utf8")));
  const names = new Set<string>();
  for (const c of state.contacts) {
    if (c.photo?.kind === "file") names.add(c.photo.fileName);
    if (c.logo) names.add(c.logo.fileName);
  }
  const photos: SetupBackup["photos"] = [];
  let bytes = Buffer.byteLength(JSON.stringify(state));
  for (const name of names) {
    imageName.parse(name);
    try {
      const file = path.join(profile, "photos", name);
      if ((await fs.lstat(file)).isSymbolicLink()) throw new Error("A contact image is a symbolic link and cannot be backed up.");
      if ((await fs.stat(file)).size > 8 * 1024 * 1024) throw new Error("A contact image exceeds the backup image limit.");
      const data = (await fs.readFile(file)).toString("base64");
      bytes += data.length;
      if (bytes > MAX_BACKUP_BYTES) throw new Error("Your images make this backup larger than 100 MB.");
      photos.push({ name, data });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // Missing cached images are allowed; contacts and settings remain usable.
    }
  }
  let clientChoices;
  try { clientChoices = clientChoicesSchema.parse(JSON.parse(await fs.readFile(path.join(profile, "clients.json"), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return parseBackup(JSON.stringify({ format: "qcf-contacts-backup", version: 1, createdAt: new Date().toISOString(), appVersion: version, state, photos, clientChoices }));
}

export async function writeBackup(file: string, backup: SetupBackup): Promise<void> {
  const text = JSON.stringify(backup, null, 2);
  parseBackup(text);
  await atomicWrite(file, text);
}

async function atomicWrite(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
}

export const backupDirectory = (profile: string): string => path.join(profile, "backups");
const pendingPath = (profile: string): string => path.join(profile, "pending-restore.json");

export async function stageRestore(profile: string, backup: SetupBackup): Promise<void> {
  await writeBackup(pendingPath(profile), backup);
}

/** Apply before services start: exit-time saves from the previous process cannot overwrite the restore. */
export async function applyPendingRestore(profile: string, version: string): Promise<boolean> {
  let backup: SetupBackup;
  try { backup = await readBackup(pendingPath(profile)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  const stamp = randomUUID();
  // A failed safety backup aborts restoration without replacing the current setup.
  let previous: SetupBackup | undefined;
  try {
    previous = await captureSetup(profile, version);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (previous) await writeBackup(path.join(backupDirectory(profile), `before-restore-${Date.now()}-${stamp}.json`), previous);
  const restored = structuredClone(backup.state);
  // Fresh names keep current photos intact even if restoration is interrupted.
  const images = new Map<string, string>();
  await fs.mkdir(path.join(profile, "photos"), { recursive: true });
  for (const photo of backup.photos) {
    const name = `${stamp}-${images.size}${path.extname(photo.name).toLowerCase()}`;
    await fs.writeFile(path.join(profile, "photos", name), Buffer.from(photo.data, "base64"), { flag: "wx" });
    images.set(photo.name, name);
  }
  for (const c of restored.contacts) {
    if (c.photo?.kind === "file") {
      const name = images.get(c.photo.fileName);
      if (name) c.photo.fileName = name; else delete c.photo;
    }
    if (c.logo) {
      const name = images.get(c.logo.fileName);
      if (name) c.logo.fileName = name; else delete c.logo;
    }
  }
  // Restore does not transfer sign-ins. Archive existing sessions locally so a
  // restored configuration cannot use an unrelated Salesforce/Microsoft account.
  for (const name of ["m365-token-cache.bin", "salesforce-tokens.bin", "clients.json", "logo-index.json"]) {
    try { await fs.rename(path.join(profile, name), path.join(profile, `${name}.before-restore-${stamp}`)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  if (backup.clientChoices) {
    await atomicWrite(path.join(profile, "clients.json"), JSON.stringify({ candidates: [], salesforce: [], ...backup.clientChoices }));
  }
  await atomicWrite(path.join(profile, "state.json"), JSON.stringify(restored, null, 2));
  await fs.unlink(pendingPath(profile));
  return true;
}

/** One checkpoint per day/version. Updates use the same persistent profile. */
export async function automaticBackup(profile: string, version: string, current: PersistedState): Promise<void> {
  const folder = backupDirectory(profile);
  const safeVersion = version.replace(/[^a-zA-Z0-9.-]/g, "_");
  const file = path.join(folder, `auto-${new Date().toISOString().slice(0, 10)}-${safeVersion}.json`);
  try { await fs.access(file); return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await writeBackup(file, await captureSetup(profile, version, current));
  const files = (await fs.readdir(folder)).filter(n => /^auto-\d{4}-\d{2}-\d{2}-[a-zA-Z0-9._-]+\.json$/.test(n));
  const dated = await Promise.all(files.map(async name => ({ name, time: (await fs.stat(path.join(folder, name))).mtimeMs })));
  for (const old of dated.sort((a, b) => b.time - a.time).slice(10)) await fs.unlink(path.join(folder, old.name));
}
