import { describe, expect, it } from "vitest";
import { applyTeamList, contactsToSheetRows, encodeShareUrl, isOneDriveShareUrl } from "./teamList";
import { buildIncomingContacts, guessHeaderMapping, mappingHasRequiredFields } from "./importMapping";
import { createContact } from "./merge";
import type { Contact, IncomingContact } from "./types";

const NOW = "2026-11-21T12:00:00.000Z";
const person = (name: string, email: string, extra: Partial<IncomingContact> = {}): IncomingContact => ({ name, email, ...extra });

describe("team list", () => {
  it("accepts OneDrive and SharePoint share links only", () => {
    expect(isOneDriveShareUrl("https://1drv.ms/x/s!AbC")).toBe(true);
    expect(isOneDriveShareUrl("https://contoso-my.sharepoint.com/:x:/g/personal/a_b/EaBc")).toBe(true);
    expect(isOneDriveShareUrl("https://onedrive.live.com/edit?id=1")).toBe(true);
    expect(isOneDriveShareUrl("http://contoso.sharepoint.com/x")).toBe(false);
    expect(isOneDriveShareUrl("https://sharepoint.com.evil.example/x")).toBe(false);
    expect(isOneDriveShareUrl("not a link")).toBe(false);
  });

  it("encodes a share link the way Graph's /shares endpoint expects", () => {
    // Example from the Microsoft Graph "Accessing shared items" docs.
    expect(encodeShareUrl("https://onedrive.live.com/redir?resid=1231244193912!12&authKey=1201919!12921!1")).toBe(
      "u!aHR0cHM6Ly9vbmVkcml2ZS5saXZlLmNvbS9yZWRpcj9yZXNpZD0xMjMxMjQ0MTkzOTEyITEyJmF1dGhLZXk9MTIwMTkxOSExMjkyMSEx",
    );
  });

  it("adds new people, links people you already had, and keeps your pins and notes", () => {
    const mine: Contact = { ...createContact(person("Dana Whitfield", "dana@brightpath.com"), 0, NOW), pinned: true, notes: "my note" };
    const { contacts, summary } = applyTeamList([mine], [person("Dana Whitfield", "dana@brightpath.com", { notes: "team note", title: "CFO" }), person("Rob Kessler", "rob@kestrel.com")], NOW);
    expect(summary).toEqual({ added: 1, updated: 1, removed: 0 });
    const dana = contacts.find((c) => c.email === "dana@brightpath.com")!;
    expect(dana).toMatchObject({ id: mine.id, team: "matched", pinned: true, notes: "my note", title: "CFO" });
    expect(contacts.find((c) => c.email === "rob@kestrel.com")?.team).toBe("added");
  });

  it("removes people the list added once they leave it, but only unlinks people you had yourself", () => {
    const mine = createContact(person("Dana Whitfield", "dana@brightpath.com"), 0, NOW);
    const personal = createContact(person("Sam Patel", "sam@example.com"), 1, NOW);
    const first = applyTeamList([mine, personal], [person("Dana Whitfield", "dana@brightpath.com"), person("Rob Kessler", "rob@kestrel.com")], NOW);
    const rob = first.contacts.find((c) => c.email === "rob@kestrel.com")!;
    const second = applyTeamList(first.contacts, [person("Jo Kim", "jo@example.com")], NOW);
    expect(second.removedIds).toEqual([rob.id]);
    expect(second.summary.removed).toBe(1);
    const dana = second.contacts.find((c) => c.email === "dana@brightpath.com")!;
    expect(dana.team).toBeUndefined();
    expect(second.contacts.map((c) => c.email).sort()).toEqual(["dana@brightpath.com", "jo@example.com", "sam@example.com"]);
    expect(second.contacts.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it("keeps a contact the list added as added on later syncs", () => {
    const first = applyTeamList([], [person("Rob Kessler", "rob@kestrel.com")], NOW);
    const second = applyTeamList(first.contacts, [person("Rob Kessler", "rob@kestrel.com", { title: "Owner" })], NOW);
    expect(second.contacts[0]).toMatchObject({ team: "added", title: "Owner" });
    expect(applyTeamList(second.contacts, [person("Jo Kim", "jo@example.com")], NOW).removedIds).toEqual([second.contacts[0].id]);
  });

  it("exports a sheet the importer reads straight back", () => {
    const c = createContact(person("Dana Whitfield", "dana@brightpath.com", { title: "CFO", company: "BrightPath", phone: "+12025550101", mobilePhone: "+12025550102", group: "Clients", notes: "Prefers texts" }), 0, NOW);
    const rows = contactsToSheetRows([c]);
    const { mapping, dataRows } = guessHeaderMapping(rows);
    expect(mappingHasRequiredFields(mapping)).toBe(true);
    const back = buildIncomingContacts(dataRows, mapping).contacts[0];
    expect(back).toMatchObject({ name: "Dana Whitfield", title: "CFO", company: "BrightPath", email: "dana@brightpath.com", phone: "+12025550101", mobilePhone: "+12025550102", group: "Clients", notes: "Prefers texts" });
  });
});
