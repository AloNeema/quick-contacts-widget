import { describe, expect, it } from "vitest";
import { buildIncomingContacts, guessHeaderMapping, looksLikeHeaderRow, mappingHasRequiredFields } from "./importMapping";
import { formatPhoneForDisplay, normalizeUsPhone } from "./phone";

describe("normalizeUsPhone", () => {
  it("handles common shapes", () => {
    expect(normalizeUsPhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizeUsPhone("1-555-123-4567")).toBe("+15551234567");
    expect(normalizeUsPhone("+1 555 123 4567")).toBe("+15551234567");
    expect(normalizeUsPhone("12345")).toBe("");
    expect(normalizeUsPhone(undefined)).toBe("");
  });
  it("formats for display", () => {
    expect(formatPhoneForDisplay("+15551234567")).toBe("(555) 123-4567");
    expect(formatPhoneForDisplay("+447700900123")).toBe("+447700900123");
  });
});

describe("guessHeaderMapping", () => {
  it("maps a typical Excel export with a header row", () => {
    const rows = [
      ["Full Name", "Job Title", "Company", "Work Email", "Mobile Phone", "LinkedIn"],
      ["Jane Doe", "VP Lending", "Acme Bank", "jane@acme.com", "(555) 111-2222", "https://www.linkedin.com/in/janedoe"],
      ["John Roe", "Broker", "Roe Capital", "john@roe.com", "555-333-4444", ""],
    ];
    const { mapping, dataRows, hadHeader } = guessHeaderMapping(rows);
    expect(hadHeader).toBe(true);
    expect(mapping).toEqual(["name", "title", "company", "email", "phone", "linkedinUrl"]);
    expect(dataRows).toHaveLength(2);
  });
  it("prefers First + Last over an Account Name column", () => {
    const rows = [
      ["First Name", "Last Name", "Account Name", "Email"],
      ["Jane", "Doe", "Acme Bank", "jane@acme.com"],
    ];
    expect(guessHeaderMapping(rows).mapping).toEqual(["firstName", "lastName", "company", "email"]);
  });
  it("falls back to value sniffing without a header", () => {
    const rows = [
      ["Jane Doe", "jane@acme.com", "(555) 111-2222"],
      ["John Roe", "john@roe.com", "555-333-4444"],
      ["Sam Lee", "sam@lee.io", "555 555 6666"],
    ];
    const { mapping, hadHeader } = guessHeaderMapping(rows);
    expect(hadHeader).toBe(false);
    expect(mapping).toEqual(["name", "email", "phone"]);
  });
  it("detects header rows", () => {
    expect(looksLikeHeaderRow(["Name", "Email"])).toBe(true);
    expect(looksLikeHeaderRow(["Jane", "jane@acme.com"])).toBe(false);
  });
});

describe("buildIncomingContacts", () => {
  it("normalizes names, emails and phones and skips rows without a key", () => {
    const mapping = ["firstName", "lastName", "email", "phone", "title"] as const;
    const rows = [
      ["JANE", "DOE", "Jane@Acme.com", "(555) 111-2222", "VP"],
      ["", "", "", "", ""],
      ["No", "Key", "", "", "Ghost"],
      ["Roe, John", "", "john@roe.com", "", ""],
    ];
    const { contacts, skipped } = buildIncomingContacts(rows, [...mapping]);
    expect(skipped).toBe(1);
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toMatchObject({ name: "Jane Doe", email: "jane@acme.com", phone: "+15551112222", title: "VP" });
    expect(contacts[1].name).toBe("Roe, John"); // first-name column is used verbatim; only full-name columns flip "Last, First"
  });
  it("flips Last, First in a full-name column", () => {
    const { contacts } = buildIncomingContacts([["Roe, John", "john@roe.com"]], ["name", "email"]);
    expect(contacts[0].name).toBe("John Roe");
  });
  it("requires a name and a key field", () => {
    expect(mappingHasRequiredFields(["name", "email"])).toBe(true);
    expect(mappingHasRequiredFields(["firstName", "phone"])).toBe(true);
    expect(mappingHasRequiredFields(["name", "company"])).toBe(false);
    expect(mappingHasRequiredFields(["email", "phone"])).toBe(false);
  });
});
