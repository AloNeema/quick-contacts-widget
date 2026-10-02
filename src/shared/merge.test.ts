import { describe, expect, it } from "vitest";
import { createContact, filterContacts, hueForName, initialsOf, mergeContacts, moveContact, normalizeOrder } from "./merge";
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
