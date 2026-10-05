import { describe, expect, it } from "vitest";
import { createContact, filterContacts, mergeContacts, moveContactTo } from "./merge";

const make = (name: string, order: number) => ({ ...createContact({ name }, order), id: name });

describe("direct reordering", () => {
  const contacts = ["A", "B", "C", "D", "E"].map(make);
  it("moves any distance in either direction with contiguous order", () => {
    const moved = moveContactTo(contacts, "E", "A", "before");
    expect(moved.map((c) => c.id)).toEqual(["E", "A", "B", "C", "D"]);
    const back = moveContactTo(moved, "E", "D", "after");
    expect(back.map((c) => c.id)).toEqual(["A", "B", "C", "D", "E"]);
    expect(back.map((c) => c.order)).toEqual([0, 1, 2, 3, 4]);
    expect(contacts.map((c) => c.order)).toEqual([0, 1, 2, 3, 4]);
  });
  it("keeps hidden contacts and metadata when moving between filtered targets", () => {
    const personal = contacts.map((c) => ({ ...c, notes: "Keep this", mobilePhone: "+12025550102", defaultCallPhone: "cell" as const }));
    const next = moveContactTo(personal, "E", "B", "before");
    expect(next.map((c) => c.id)).toEqual(["A", "E", "B", "C", "D"]);
    expect(next.every((c) => c.notes === "Keep this" && c.defaultCallPhone === "cell")).toBe(true);
  });
  it("preserves pinned sections and safely ignores invalid drops", () => {
    const pins = contacts.map((c, i) => ({ ...c, pinned: i < 2 }));
    expect(moveContactTo(pins, "B", "A", "before").map((c) => c.id)).toEqual(["B", "A", "C", "D", "E"]);
    expect(moveContactTo(pins, "C", "A", "before")).toEqual(pins);
    expect(moveContactTo(pins, "missing", "A", "before")).toEqual(pins);
    expect(moveContactTo(pins, "A", "A", "after")).toEqual(pins);
  });
  it("uses the displayed sort as the starting order when switching to manual", () => {
    const reversed = [...contacts].reverse().map((c, order) => ({ ...c, order }));
    expect(moveContactTo(reversed, "E", "B", "before", "name").map((c) => c.id)).toEqual(["A", "E", "B", "C", "D"]);
  });
});

describe("two-number imports", () => {
  it("corrects an old mobile-only import when labeled columns are imported again", () => {
    const original = { ...make("Jane", 0), phone: "+12025550102" };
    const result = mergeContacts([original], [{ name: "Jane", phone: "+12025550101", mobilePhone: original.phone }]);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toMatchObject({ id: original.id, phone: "+12025550101", mobilePhone: original.phone });
  });
  it("does not collapse coworkers who share an office line", () => {
    const incoming = [
      { name: "Jane", phone: "+12025550101", mobilePhone: "+12025550102" },
      { name: "John", phone: "+12025550101", mobilePhone: "+12025550103" },
    ];
    const first = mergeContacts([], incoming);
    expect(first.contacts).toHaveLength(2);
    const again = mergeContacts(first.contacts, incoming);
    expect(again.contacts).toHaveLength(2);
    expect(again.summary.added).toBe(0);
  });
  it("matches the cell number and preserves personal preferences during reimport", () => {
    const original = { ...make("Jane", 0), phone: "+12025550101", mobilePhone: "+12025550102", defaultCallPhone: "cell" as const, notes: "Text after 3" };
    const result = mergeContacts([original], [{ name: "Jane Updated", mobilePhone: original.mobilePhone, phone: "+12025550103" }]);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toMatchObject({ id: original.id, phone: original.phone, mobilePhone: original.mobilePhone, defaultCallPhone: "cell", notes: original.notes });
    expect(filterContacts(result.contacts, "5550102")).toHaveLength(1);
  });
  it("adds cell-only records and fills a missing cell without duplicating a contact", () => {
    const original = { ...make("Jane", 0), email: "jane@example.com", phone: "+12025550101" };
    const result = mergeContacts([original], [{ name: "Jane", email: original.email, mobilePhone: "+12025550102" }, { name: "John", mobilePhone: "+12025550103" }]);
    expect(result.summary).toMatchObject({ added: 1, updated: 1, skipped: 0 });
    expect(result.contacts[0].mobilePhone).toBe("+12025550102");
    expect(result.contacts[1].mobilePhone).toBe("+12025550103");
  });
});
