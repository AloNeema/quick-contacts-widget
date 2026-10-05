import { describe, expect, it } from "vitest";
import { applySyncChanges, createContact, filterContacts, hueForName, initialsOf, mergeContacts, moveContact, normalizeOrder, recentContacts, recordContactUse, groupsOf, relativeTime, sortContacts } from "./merge";
import type { Contact } from "./types";

const NOW = "2026-10-02T00:00:00.000Z";
const mk = (over: Partial<Contact> & { name: string }, order = 0): Contact => ({
  ...createContact({ name: over.name }, order, NOW),
  ...over,
});

describe("mergeContacts", () => {
  it("matches by email and keeps photo, pin, order and id", () => {
    const jane = mk({ name: "Jane Doe", email: "jane@acme.com", pinned: true, photo: { kind: "file", fileName: "jane.png" } }, 0);
    const { contacts, summary } = mergeContacts(
      [jane],
      [{ name: "Jane A. Doe", email: "jane@acme.com", title: "SVP", photoUrl: "https://x/y.png" }],
      { removeMissing: false },
      "2026-10-03T00:00:00.000Z",
    );
    expect(summary).toEqual({ added: 0, updated: 1, skipped: 0, removed: 0 });
    expect(contacts[0]).toMatchObject({ id: jane.id, name: "Jane A. Doe", title: "SVP", pinned: true, photo: { kind: "file", fileName: "jane.png" } });
    expect(contacts[0].updatedAt).toBe("2026-10-03T00:00:00.000Z");
  });
  it("matches by phone when email is missing and fills the missing email", () => {
    const john = mk({ name: "John Roe", phone: "+15553334444" });
    const { contacts, summary } = mergeContacts([john], [{ name: "John Roe", phone: "+15553334444", email: "john@roe.com" }]);
    expect(summary.updated).toBe(1);
    expect(contacts[0].email).toBe("john@roe.com");
  });
  it("does not clobber fields with empty incoming values", () => {
    const c = mk({ name: "Sam Lee", email: "sam@lee.io", title: "Partner", company: "Lee & Co" });
    const { contacts, summary } = mergeContacts([c], [{ name: "Sam Lee", email: "sam@lee.io", title: "", company: undefined }]);
    expect(summary.updated).toBe(0);
    expect(contacts[0]).toMatchObject({ title: "Partner", company: "Lee & Co" });
  });
  it("adds new contacts after existing ones and collapses in-file duplicates", () => {
    const c = mk({ name: "Sam Lee", email: "sam@lee.io" });
    const { contacts, summary } = mergeContacts([c], [
      { name: "New Person", email: "new@x.com" },
      { name: "New Person", email: "new@x.com", phone: "+15550001111" },
      { name: "Keyless", email: undefined, phone: undefined },
    ]);
    expect(summary).toEqual({ added: 1, updated: 0, skipped: 2, removed: 0 });
    expect(contacts.map((x) => x.name)).toEqual(["Sam Lee", "New Person"]);
    expect(contacts[1].order).toBe(1);
  });
  it("removes missing contacts only when asked", () => {
    const a = mk({ name: "A", email: "a@x.com" }, 0);
    const b = mk({ name: "B", email: "b@x.com" }, 1);
    expect(mergeContacts([a, b], [{ name: "A", email: "a@x.com" }]).contacts).toHaveLength(2);
    const r = mergeContacts([a, b], [{ name: "A", email: "a@x.com" }], { removeMissing: true });
    expect(r.contacts.map((c) => c.name)).toEqual(["A"]);
    expect(r.summary.removed).toBe(1);
  });
});

describe("recents", () => {
  it("records use and lists newest first with a limit", () => {
    const a = mk({ name: "A" }, 0);
    const b = mk({ name: "B" }, 1);
    const c = mk({ name: "C" }, 2);
    let list = recordContactUse([a, b, c], a.id, "2026-10-01T00:00:00.000Z");
    list = recordContactUse(list, c.id, "2026-10-02T00:00:00.000Z");
    list = recordContactUse(list, a.id, "2026-10-03T00:00:00.000Z");
    expect(list.find((x) => x.id === a.id)?.contactCount).toBe(2);
    expect(recentContacts(list).map((x) => x.name)).toEqual(["A", "C"]);
    expect(recentContacts(list, 1).map((x) => x.name)).toEqual(["A"]);
  });
});

describe("groups, notes and relative time", () => {
  it("lists groups by size then name and filters by group", () => {
    const list = [mk({ name: "A", group: "Lenders" }), mk({ name: "B", group: "Brokers" }, 1), mk({ name: "C", group: "Lenders" }, 2), mk({ name: "D" }, 3)];
    expect(groupsOf(list)).toEqual(["Lenders", "Brokers"]);
    expect(filterContacts(list, "", "Lenders").map((c) => c.name)).toEqual(["A", "C"]);
    expect(filterContacts(list, "b", "Brokers").map((c) => c.name)).toEqual(["B"]);
  });
  it("keeps a personal note on re-import but adopts group changes", () => {
    const c = mk({ name: "A", email: "a@x.com", notes: "Met at NAEB", group: "Lenders" });
    const { contacts } = mergeContacts([c], [{ name: "A", email: "a@x.com", notes: "from sheet", group: "Brokers" }]);
    expect(contacts[0]).toMatchObject({ notes: "Met at NAEB", group: "Brokers" });
  });
  it("formats relative time", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    expect(relativeTime("2026-10-03T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-03T11:15:00Z", now)).toBe("45m ago");
    expect(relativeTime("2026-10-03T06:00:00Z", now)).toBe("6h ago");
    expect(relativeTime("2026-09-30T12:00:00Z", now)).toBe("3d ago");
    expect(relativeTime(undefined, now)).toBe("");
  });
});

describe("sortContacts", () => {
  const a = mk({ name: "alice", lastContactedAt: "2026-10-01T00:00:00Z", contactCount: 2 }, 2);
  const b = mk({ name: "Bob", lastContactedAt: "2026-10-03T00:00:00Z", contactCount: 1 }, 0);
  const c = mk({ name: "Carl", contactCount: 5 }, 1);
  const p = mk({ name: "Zed", pinned: true }, 3);
  const names = (list: ReturnType<typeof sortContacts>) => list.map((x) => x.name);
  it("keeps pinned on top in every mode", () => {
    for (const s of ["manual", "name", "recent", "frequent"] as const) expect(sortContacts([a, b, c, p], s)[0].name).toBe("Zed");
  });
  it("sorts A to Z, recent first, and most contacted first", () => {
    expect(names(sortContacts([a, b, c, p], "manual"))).toEqual(["Zed", "Bob", "Carl", "alice"]);
    expect(names(sortContacts([a, b, c, p], "name"))).toEqual(["Zed", "alice", "Bob", "Carl"]);
    expect(names(sortContacts([a, b, c, p], "recent"))).toEqual(["Zed", "Bob", "alice", "Carl"]);
    expect(names(sortContacts([a, b, c, p], "frequent"))).toEqual(["Zed", "Carl", "alice", "Bob"]);
  });
});

describe("ordering and search", () => {
  it("puts pinned first and renumbers", () => {
    const a = mk({ name: "A" }, 0);
    const b = mk({ name: "B", pinned: true }, 1);
    expect(normalizeOrder([a, b]).map((c) => [c.name, c.order])).toEqual([["B", 0], ["A", 1]]);
  });
  it("moves within the pinned group only", () => {
    const a = mk({ name: "A", pinned: true }, 0);
    const b = mk({ name: "B" }, 1);
    const c = mk({ name: "C" }, 2);
    expect(moveContact([a, b, c], c.id, -1).map((x) => x.name)).toEqual(["A", "C", "B"]);
    expect(moveContact([a, b, c], b.id, -1).map((x) => x.name)).toEqual(["A", "B", "C"]);
  });
  it("filters by name, company, email and phone digits", () => {
    const list = [mk({ name: "Jane Doe", company: "Acme", email: "jane@acme.com", phone: "+15551112222" }), mk({ name: "John Roe" }, 1)];
    expect(filterContacts(list, "acme").map((c) => c.name)).toEqual(["Jane Doe"]);
    expect(filterContacts(list, "555-111").map((c) => c.name)).toEqual(["Jane Doe"]);
    expect(filterContacts(list, "roe").map((c) => c.name)).toEqual(["John Roe"]);
    expect(filterContacts(list, "")).toHaveLength(2);
  });
  it("derives initials and a stable hue", () => {
    expect(initialsOf("Jane A. Doe")).toBe("JD");
    expect(initialsOf("Cher")).toBe("CH");
    expect(hueForName("Jane Doe")).toBe(hueForName("jane doe"));
    expect(hueForName("Jane Doe")).toBeLessThan(360);
  });
});

describe("applySyncChanges", () => {
  const base = [createContact({ name: "Dana", email: "dana@x.com", title: "Owner" }, 0), createContact({ name: "Sam", email: "sam@y.com" }, 1)];
  it("keeps edits, adds and deletes made while a sync ran", () => {
    const snapshot = base;
    const synced = snapshot.map((c) => ({ ...c, title: "CEO", company: "Bright" }));
    const added = createContact({ name: "New", email: "new@z.com" }, 2);
    // Meanwhile: Dana's title edited by hand, Sam deleted, a contact added.
    const latest = [{ ...base[0], title: "Founder", notes: "call Tue" }, added];
    const out = applySyncChanges(latest, snapshot, synced, ["title", "company"]);
    expect(out.map((c) => c.name)).toEqual(["Dana", "New"]);
    expect(out[0]).toMatchObject({ title: "Founder", company: "Bright", notes: "call Tue" });
    expect(out[1]).toBe(added);
  });
  it("applies sync changes when nobody edited", () => {
    const synced = base.map((c) => ({ ...c, title: "CEO" }));
    expect(applySyncChanges(base, base, synced, ["title"]).map((c) => c.title)).toEqual(["CEO", "CEO"]);
  });
});
