import { describe, expect, it } from "vitest";
import { createContact } from "./merge";
import { contactsToVCard, contactToVCard, splitName } from "./vcard";

const contact = (over = {}) => ({ ...createContact({ name: "Dana Whitfield" }, 0), ...over });

describe("vCard export", () => {
  it("writes the fields Google and Outlook import", () => {
    const v = contactToVCard(contact({ title: "CFO", company: "BrightPath Logistics", email: "dana@brightpath.com", phone: "+12025550101", mobilePhone: "+12025550102", website: "https://brightpath.com/", group: "Clients", notes: "Prefers texts" }));
    expect(v.split("\r\n")).toEqual([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Whitfield;Dana;;;",
      "FN:Dana Whitfield",
      "ORG:BrightPath Logistics",
      "TITLE:CFO",
      "TEL;TYPE=WORK,VOICE,PREF:+12025550101",
      "TEL;TYPE=CELL:+12025550102",
      "EMAIL;TYPE=INTERNET,WORK:dana@brightpath.com",
      "URL;TYPE=WORK:https://brightpath.com/",
      "CATEGORIES:Clients",
      "NOTE:Prefers texts",
      "END:VCARD",
    ]);
  });
  it("marks the cell number preferred when it is the calling default or the only number", () => {
    expect(contactToVCard(contact({ phone: "+12025550101", mobilePhone: "+12025550102", defaultCallPhone: "cell" }))).toContain("TEL;TYPE=CELL,PREF:+12025550102");
    expect(contactToVCard(contact({ mobilePhone: "+12025550102" }))).toContain("TEL;TYPE=CELL,PREF:+12025550102");
  });
  it("escapes commas, semicolons, backslashes and newlines", () => {
    const v = contactToVCard(contact({ title: "VP, Lending; East", notes: "Line one\nC:\\path" }));
    expect(v).toContain("TITLE:VP\\, Lending\\; East");
    expect(v).toContain("NOTE:Line one\\nC:\\\\path");
  });
  it("folds long lines at 75 octets without splitting characters", () => {
    const v = contactToVCard(contact({ notes: "é".repeat(100) }));
    const lines = v.split("\r\n");
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    const note = lines.slice(lines.findIndex((l) => l.startsWith("NOTE:"))).filter((l, i) => i === 0 || l.startsWith(" ")).map((l, i) => (i ? l.slice(1) : l)).join("");
    expect(note).toBe(`NOTE:${"é".repeat(100)}`);
  });
  it("splits names and joins several contacts", () => {
    expect(splitName("Jane Q. Doe")).toEqual({ given: "Jane Q.", family: "Doe" });
    expect(splitName("Cher")).toEqual({ given: "Cher", family: "" });
    const file = contactsToVCard([contact(), contact({ name: "Rob Kessler" })]);
    expect(file.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(file.endsWith("END:VCARD\r\n")).toBe(true);
  });
});
