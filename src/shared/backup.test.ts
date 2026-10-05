import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_SETTINGS } from "./defaults";
import { createContact } from "./merge";
import { applyPendingRestore, automaticBackup, captureSetup, parseBackup, readBackup, stageRestore, writeBackup } from "../main/backup";

const profile = vi.hoisted(() => ({ directory: "" }));
vi.mock("electron", () => ({ app: { getPath: () => profile.directory } }));
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "qcf-backup-"));
  profile.directory = root;
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (!path.isAbsolute(root) || !root.startsWith(path.join(os.tmpdir(), "qcf-backup-"))) throw new Error("Unexpected test directory");
  await fs.rm(root, { recursive: true, force: true });
});
async function seed(directory = root) {
  await fs.mkdir(path.join(directory, "photos"), { recursive: true });
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.m365 = { ...settings.m365, clientId: "saved-app-id", tenant: "saved-tenant" };
  settings.salesforce.consumerKey = "saved-consumer-key";
  const contact = { ...createContact({ name: "Backup Test", phone: "+12025550101", mobilePhone: "+12025550102", notes: "Keep this note" }, 0), defaultCallPhone: "cell" as const, defaultTextPhone: "office" as const, pinned: true, contactCount: 7, photo: { kind: "file" as const, fileName: "contact.png" } };
  const state = { settings, contacts: [contact] };
  await fs.writeFile(path.join(directory, "state.json"), JSON.stringify(state));
  await fs.writeFile(path.join(directory, "photos", "contact.png"), "image-bytes");
  return state;
}

describe("setup backup and restore", () => {
  it("round trips IDs, consumer key, contact preferences, notes and images while excluding credentials", async () => {
    const state = await seed();
    await fs.writeFile(path.join(root, "salesforce-tokens.bin"), "secret-token-must-not-export");
    await fs.writeFile(path.join(root, "clients.json"), JSON.stringify({ marks: { "a@example.com": { notClient: true } }, firstSeen: {}, candidates: [{ lastPreview: "private cached email" }] }));
    const backup = await captureSetup(root, "0.1.4-beta.2");
    expect(JSON.stringify(backup)).not.toContain("secret-token");
    expect(JSON.stringify(backup)).not.toContain("private cached email");
    const target = path.join(root, "other-profile");
    await stageRestore(target, backup);
    await applyPendingRestore(target, "0.1.4-beta.2");
    const restored = JSON.parse(await fs.readFile(path.join(target, "state.json"), "utf8"));
    expect(restored.settings).toEqual(state.settings);
    expect(restored.contacts[0]).toEqual({ ...state.contacts[0], photo: { kind: "file", fileName: expect.any(String) } });
    expect(await fs.readFile(path.join(target, "photos", restored.contacts[0].photo.fileName), "utf8")).toBe("image-bytes");
    expect(JSON.parse(await fs.readFile(path.join(target, "clients.json"), "utf8")).marks).toEqual({ "a@example.com": { notClient: true } });
    expect(await applyPendingRestore(target, "0.1.4-beta.2")).toBe(false);
    profile.directory = target;
    vi.resetModules();
    const store = await import("../main/store");
    expect((await store.loadState()).settings).toEqual(state.settings);
    await store.patchSettings({ alwaysOnTop: true });
    vi.resetModules();
    const restarted = await import("../main/store");
    expect((await restarted.loadState()).settings.m365.clientId).toBe("saved-app-id");
    expect(restarted.getState().contacts[0].notes).toBe("Keep this note");
    expect(JSON.parse(await fs.readFile(path.join(root, "state.json"), "utf8"))).toEqual(state);
  });
  it("backs up the latest target state before replacement, preserves photos and archives local sessions", async () => {
    const before = await seed();
    const backup = await captureSetup(root, "test");
    backup.state.contacts[0].name = "Restored";
    await stageRestore(root, backup);
    before.contacts[0].name = "Edit while awaiting restart";
    await fs.writeFile(path.join(root, "state.json"), JSON.stringify(before));
    await fs.writeFile(path.join(root, "m365-token-cache.bin"), "encrypted-cache");
    await applyPendingRestore(root, "test");
    const files = await fs.readdir(path.join(root, "backups"));
    const saved = await readBackup(path.join(root, "backups", files[0]));
    expect(saved.state.contacts[0].name).toBe("Edit while awaiting restart");
    expect(await fs.readFile(path.join(root, "photos", "contact.png"), "utf8")).toBe("image-bytes");
    const archived = (await fs.readdir(root)).find(n => n.startsWith("m365-token-cache.bin.before-restore-"))!;
    expect(await fs.readFile(path.join(root, archived), "utf8")).toBe("encrypted-cache");
    expect(JSON.parse(await fs.readFile(path.join(root, "state.json"), "utf8")).contacts[0].name).toBe("Restored");
  });
  it("rejects path traversal, duplicate contacts and unsupported versions before staging", async () => {
    await seed();
    const backup = await captureSetup(root, "test");
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 99 }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...backup, photos: [{ name: "../state.json", data: "" }] }))).toThrow();
    const duplicate = structuredClone(backup);
    duplicate.state.contacts.push(duplicate.state.contacts[0]);
    await expect(stageRestore(root, duplicate)).rejects.toThrow(/duplicate/);
    await expect(fs.access(path.join(root, "pending-restore.json"))).rejects.toThrow();
  });
  it("does not replace the current state when the safety backup fails", async () => {
    const before = await seed();
    const backup = await captureSetup(root, "test");
    backup.state.contacts = [];
    await stageRestore(root, backup);
    await fs.writeFile(path.join(root, "backups"), "obstruction");
    await expect(applyPendingRestore(root, "test")).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(path.join(root, "state.json"), "utf8"))).toEqual(before);
    await expect(fs.access(path.join(root, "pending-restore.json"))).resolves.toBeUndefined();
  });
  it("keeps missing images from blocking recovery of contacts and configuration", async () => {
    await seed();
    await fs.unlink(path.join(root, "photos", "contact.png"));
    const backup = await captureSetup(root, "test");
    const target = path.join(root, "new");
    await stageRestore(target, backup);
    await applyPendingRestore(target, "test");
    const restored = JSON.parse(await fs.readFile(path.join(target, "state.json"), "utf8"));
    expect(restored.contacts).toHaveLength(1);
    expect(restored.contacts[0].photo).toBeUndefined();
    expect(restored.settings.salesforce.consumerKey).toBe("saved-consumer-key");
  });
  it("makes a new version checkpoint without overwriting an earlier checkpoint", async () => {
    const state = await seed();
    await automaticBackup(root, "1.0.0", state);
    state.contacts = [];
    await automaticBackup(root, "1.0.0", state);
    await automaticBackup(root, "1.0.1", state);
    const files = await fs.readdir(path.join(root, "backups"));
    expect(files).toHaveLength(2);
    const first = await readBackup(path.join(root, "backups", files.find(n => n.endsWith("1.0.0.json"))!));
    expect(first.state.contacts).toHaveLength(1);
  });
  it("exports to a file that can be validated and read back", async () => {
    await seed();
    const backup = await captureSetup(root, "test");
    const file = path.join(root, "export.json");
    await writeBackup(file, backup);
    expect(await readBackup(file)).toEqual(backup);
  });
});
