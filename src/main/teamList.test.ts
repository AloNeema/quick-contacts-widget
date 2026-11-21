import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import type { Contact, Settings } from "@shared/types";
import { contactsToSheetRows } from "@shared/teamList";
import { createContact } from "@shared/merge";

const state: { settings: Settings; contacts: Contact[] } = { settings: { m365: { clientId: "x", tenant: "organizations", presence: true, includeOutlookContacts: false } } as Settings, contacts: [] };
const token = vi.fn<() => Promise<{ token: string } | { needsPermission: true } | { error: string }>>();

vi.mock("electron", () => ({ dialog: {}, BrowserWindow: class {} }));
vi.mock("./m365", () => ({ teamFilesToken: () => token() }));
vi.mock("./photos", () => ({ deletePhotoForContact: vi.fn(async () => undefined) }));
vi.mock("./store", () => ({
  getState: () => state,
  setContacts: vi.fn(async (c: Contact[]) => (state.contacts = c)),
}));

const { syncTeamList, teamListUrlChanged } = await import("./teamList");

const LINK = "https://contoso-my.sharepoint.com/:x:/g/personal/nick/EaBcD";
function workbook(people: Array<[string, string]>): ArrayBuffer {
  const book = XLSX.utils.book_new();
  const contacts = people.map(([name, email], i) => createContact({ name, email }, i));
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(contactsToSheetRows(contacts)), "Contacts");
  const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function graph(file: { name?: string; cTag: string; body: ArrayBuffer } | { status: number }) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(url);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
    expect(url).toContain("/shares/u!");
    if ("status" in file) return new Response("{}", { status: file.status });
    if (url.endsWith("/content")) return new Response(file.body);
    return Response.json({ name: file.name ?? "Team Contacts.xlsx", cTag: file.cTag, size: file.body.byteLength, file: {} });
  }));
  return calls;
}

describe("team list sync", () => {
  beforeEach(() => {
    state.contacts = [];
    state.settings.m365.teamListUrl = LINK;
    teamListUrlChanged();
    token.mockResolvedValue({ token: "t0ken" });
  });

  it("downloads the shared workbook and adds its people", async () => {
    graph({ cTag: "1", body: workbook([["Dana Whitfield", "dana@brightpath.com"], ["Rob Kessler", "rob@kestrel.com"]]) });
    const r = await syncTeamList();
    expect(r.changed).toBe(true);
    expect(r.status).toMatchObject({ count: 2, fileName: "Team Contacts.xlsx", error: undefined });
    expect(state.contacts.map((c) => [c.name, c.team])).toEqual([["Dana Whitfield", "added"], ["Rob Kessler", "added"]]);
  });

  it("skips the download when the file hasn't changed", async () => {
    graph({ cTag: "1", body: workbook([["Dana Whitfield", "dana@brightpath.com"]]) });
    await syncTeamList();
    const calls = graph({ cTag: "1", body: workbook([["Someone Else", "else@example.com"]]) });
    const r = await syncTeamList();
    expect(r.changed).toBe(false);
    expect(calls.some((u) => u.endsWith("/content"))).toBe(false);
    expect(state.contacts.map((c) => c.name)).toEqual(["Dana Whitfield"]);
  });

  it("removes people dropped from the file on the next change", async () => {
    graph({ cTag: "1", body: workbook([["Dana Whitfield", "dana@brightpath.com"], ["Rob Kessler", "rob@kestrel.com"]]) });
    await syncTeamList();
    graph({ cTag: "2", body: workbook([["Dana Whitfield", "dana@brightpath.com"]]) });
    await syncTeamList();
    expect(state.contacts.map((c) => c.name)).toEqual(["Dana Whitfield"]);
  });

  it("never wipes contacts when the sheet has no usable rows", async () => {
    graph({ cTag: "1", body: workbook([["Dana Whitfield", "dana@brightpath.com"]]) });
    await syncTeamList();
    const empty = XLSX.write({ SheetNames: ["S"], Sheets: { S: XLSX.utils.aoa_to_sheet([["Name", "Email"]]) } }, { type: "buffer", bookType: "xlsx" }) as Buffer;
    graph({ cTag: "2", body: empty.buffer.slice(empty.byteOffset, empty.byteOffset + empty.byteLength) as ArrayBuffer });
    const r = await syncTeamList();
    expect(r.changed).toBe(false);
    expect(r.status.error).toBeTruthy();
    expect(state.contacts.map((c) => c.name)).toEqual(["Dana Whitfield"]);
  });

  it("explains a missing permission or missing access without touching contacts", async () => {
    token.mockResolvedValueOnce({ needsPermission: true });
    expect((await syncTeamList()).status.needsPermission).toBe(true);
    graph({ status: 403 });
    const r = await syncTeamList();
    expect(r.status.error).toMatch(/don't have access/);
    expect(state.contacts).toEqual([]);
  });

  it("refuses links that aren't OneDrive or SharePoint", async () => {
    state.settings.m365.teamListUrl = "https://example.com/contacts.xlsx";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await syncTeamList()).status.error).toMatch(/OneDrive/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
