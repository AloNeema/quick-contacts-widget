import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createContact } from "./merge";
import { DEFAULT_SETTINGS } from "./defaults";

const profile = vi.hoisted(() => ({ directory: "" }));
vi.mock("electron", () => ({ app: { getPath: () => profile.directory } }));

beforeEach(async () => {
  vi.resetModules();
  profile.directory = await fs.mkdtemp(path.join(os.tmpdir(), "qcf-recovery-test-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const file of await fs.readdir(profile.directory)) await fs.unlink(path.join(profile.directory, file));
  await fs.rmdir(profile.directory);
});

async function seed(contacts: unknown[], settings: unknown = DEFAULT_SETTINGS) {
  const raw = JSON.stringify({ settings, contacts });
  await fs.writeFile(path.join(profile.directory, "state.json"), raw);
  return raw;
}

describe("legacy contact recovery", () => {
  it("retains oversized imported contacts, backs up full fields, and survives another restart", async () => {
    const contact = {
      ...createContact({ name: "Sample", website: "w".repeat(301), group: "g".repeat(61), notes: "n".repeat(2001), phone: "+12025550101", mobilePhone: "+12025550102" }, 0),
      defaultCallPhone: "cell" as const, defaultTextPhone: "office" as const,
    };
    const raw = await seed([contact]);
    let store = await import("../main/store");
    const recovered = (await store.loadState()).contacts;
    expect(recovered).toEqual([{ ...contact, website: "w".repeat(300), group: "g".repeat(60), notes: "n".repeat(2000) }]);
    const backups = (await fs.readdir(profile.directory)).filter(f => f.startsWith("state.json.corrupt-"));
    expect(backups).toHaveLength(1);
    expect(await fs.readFile(path.join(profile.directory, backups[0]), "utf8")).toBe(raw);
    vi.resetModules();
    store = await import("../main/store");
    expect((await store.loadState()).contacts).toEqual(recovered);
    expect((await fs.readdir(profile.directory)).filter(f => f.startsWith("state.json.corrupt-"))).toEqual(backups);
  });

  it("keeps valid and recoverable neighbors of invalid entries and restores settings defaults", async () => {
    const valid = createContact({ name: "Valid" }, 0);
    const recoverable = createContact({ name: "Recoverable", notes: "x".repeat(2001) }, 1);
    const legacySettings = { ...DEFAULT_SETTINGS, clients: undefined };
    await seed([valid, null, { id: "broken" }, recoverable], legacySettings);
    const store = await import("../main/store");
    const state = await store.loadState();
    expect(state.contacts.map(c => c.id)).toEqual([valid.id, recoverable.id]);
    expect(state.contacts[1].notes).toHaveLength(2000);
    expect(state.settings.clients).toEqual(DEFAULT_SETTINGS.clients);
  });

  it("leaves the source file intact when the recovery backup cannot be written", async () => {
    const contact = createContact({ name: "Sample", notes: "x".repeat(2001) }, 0);
    const raw = await seed([contact]);
    vi.spyOn(fs, "copyFile").mockRejectedValueOnce(new Error("Backup unavailable"));
    const store = await import("../main/store");
    expect((await store.loadState()).contacts[0].id).toBe(contact.id);
    expect(await fs.readFile(path.join(profile.directory, "state.json"), "utf8")).toBe(raw);
  });

  it("also retains new oversized imports after saving and restarting", async () => {
    let store = await import("../main/store");
    await store.loadState();
    const contact = createContact({ name: "New import", notes: "x".repeat(2001) }, 0);
    await store.setContacts([contact]);
    vi.resetModules();
    store = await import("../main/store");
    const saved = (await store.loadState()).contacts;
    expect(saved[0].id).toBe(contact.id);
    expect(saved[0].notes).toHaveLength(2000);
  });
});
