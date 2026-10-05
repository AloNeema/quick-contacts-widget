import { afterAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createContact } from "./merge";

const profile = vi.hoisted(() => ({ directory: "" }));
vi.mock("electron", () => ({ app: { getPath: () => profile.directory } }));

afterAll(async () => {
  if (profile.directory) {
    await fs.unlink(path.join(profile.directory, "state.json"));
    await fs.rmdir(profile.directory);
  }
});

describe("saved contact phone preferences", () => {
  it("loads an existing contact then keeps both numbers, stars and order after a restart", async () => {
    profile.directory = await fs.mkdtemp(path.join(os.tmpdir(), "qcf-phone-test-"));
    const { DEFAULT_SETTINGS } = await import("./defaults");
    const original = createContact({ name: "Sample Person", phone: "+12025550101" }, 0);
    await fs.writeFile(path.join(profile.directory, "state.json"), JSON.stringify({ settings: DEFAULT_SETTINGS, contacts: [original] }));
    let store = await import("../main/store");
    expect((await store.loadState()).contacts[0].phone).toBe(original.phone);
    const changed = { ...original, mobilePhone: "+12025550102", defaultCallPhone: "cell" as const, defaultTextPhone: "office" as const };
    await store.setContacts([store.contactSchema.parse(changed)]);
    vi.resetModules();
    store = await import("../main/store");
    expect((await store.loadState()).contacts[0]).toEqual(changed);
  });
});
