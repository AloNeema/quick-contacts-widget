import { describe, expect, it } from "vitest";
import { parseSignature, SIGNATURE_LIMIT } from "./signature";

describe("email signature suggestions", () => {
  it("extracts a lender signature with independent Office and Cell labels", () => {
    const result = parseSignature("Jane Doe\nVP, Lending\nAcme Capital\nOffice: (202) 555-0101\nMobile: (202) 555-0102\nJane.Doe@Acme.com\nwww.acme.com\nhttps://www.linkedin.com/in/jane-doe");
    expect(result.fields).toMatchObject({ name: "Jane Doe", title: "VP, Lending", company: "Acme Capital", phone: "+12025550101", mobilePhone: "+12025550102", email: "jane.doe@acme.com", website: "https://www.acme.com/", linkedinUrl: "https://www.linkedin.com/in/jane-doe" });
  });
  it("handles table text, pipes, shorthand labels and reordered numbers", () => {
    const result = parseSignature("Acme Bank\nJosé O’Neil | Relationship Manager\nM: 202.555.0102 | D: +1 202 555 0101 | F: 202-555-0103\njose@acme.com");
    expect(result.fields).toMatchObject({ name: "José O’Neil", title: "Relationship Manager", company: "Acme Bank", phone: "+12025550101", mobilePhone: "+12025550102" });
    expect(result.warnings).toContain("Fax numbers were left out of the calling fields.");
  });
  it("keeps extensions in notes, away from the dialing number", () => {
    const result = parseSignature("Jane Doe\nDirect: (202) 555-0101 ext. 237\nCell: 2025550102");
    expect(result.fields.phone).toBe("+12025550101");
    expect(result.fields.notes).toBe("+12025550101 ext. 237");
  });
  it("deduplicates repeated numbers and upgrades an unlabeled number with a later label", () => {
    const result = parseSignature("Jane Doe\n202-555-0101\nMobile: (202) 555-0101\njane@acme.com\nJANE@ACME.COM");
    expect(result.fields.phone).toBeUndefined();
    expect(result.fields.mobilePhone).toBe("+12025550101");
    expect(result.emails).toEqual(["jane@acme.com"]);
  });
  it("does not guess Cell for a second unlabeled number", () => {
    const result = parseSignature("Jane Doe\n202-555-0101 | 202-555-0102");
    expect(result.fields.phone).toBe("+12025550101");
    expect(result.fields.mobilePhone).toBeUndefined();
    expect(result.warnings.some(w => w.includes("unlabeled"))).toBe(true);
    expect(result.warnings.some(w => w.includes("extra phone"))).toBe(true);
  });
  it("retains multiple email choices and warns about ambiguity", () => {
    const result = parseSignature("Jane Doe <jane@acme.com>\nAssistant: assistant@acme.com");
    expect(result.fields.name).toBe("Jane Doe");
    expect(result.emails).toEqual(["jane@acme.com", "assistant@acme.com"]);
    expect(result.warnings.some(w => w.includes("More than one email"))).toBe(true);
  });
  it("ignores disclaimer numbers, registration IDs and quoted messages", () => {
    const result = parseSignature("Jane Doe\nNMLS #2025550199\njane@acme.com\nThis email is confidential. Call 202-555-0198.\nFrom: Someone Else <else@acme.com>");
    expect(result.fields.phone).toBeUndefined();
    expect(result.emails).toEqual(["jane@acme.com"]);
  });
  it("does not turn an email domain into a supplied company website", () => {
    const result = parseSignature("Jane Doe\njane@acme.com");
    expect(result.fields.website).toBeUndefined();
  });
  it("handles greetings, pronouns, credentials and nonbreaking spaces", () => {
    const result = parseSignature("Best regards,\r\nAlex\u00a0Morgan (they/them), MBA\r\nAccount Executive\r\nNorthstar Funding\r\nC: 202-555-0102");
    expect(result.fields).toMatchObject({ name: "Alex Morgan", title: "Account Executive", company: "Northstar Funding", mobilePhone: "+12025550102" });
  });
  it("does not convert an international number to a US number", () => {
    const result = parseSignature("Jane Doe\nMobile: +91 9876543210\njane@acme.com");
    expect(result.fields.phone).toBeUndefined();
    expect(result.fields.mobilePhone).toBeUndefined();
    expect(result.warnings.some(w => w.includes("international"))).toBe(true);
  });
  it("leaves unclear names blank and limits large pastes", () => {
    expect(parseSignature("info@acme.com").fields.name).toBe("");
    expect(parseSignature("").warnings.some(w => w.includes("No usable"))).toBe(true);
    expect(() => parseSignature("x".repeat(SIGNATURE_LIMIT + 1))).toThrow(/12,000/);
  });
  it("treats pasted markup and instructions as text, never executable content", () => {
    const result = parseSignature('<script>alert("hello")</script>\nJane Doe\njane@acme.com\nhttps://www.linkedin.com.evil.example/in/jane');
    expect(result.fields.name).toBe("Jane Doe");
    expect(result.fields.linkedinUrl).toBeUndefined();
    expect(result.source).toContain("<script>");
  });
});
