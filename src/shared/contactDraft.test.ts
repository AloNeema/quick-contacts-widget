import { describe, expect, it } from "vitest";
import { finalizeContactDraft } from "./contactDraft";
import { createContact } from "./merge";
import { parseSignature } from "./signature";

describe("finalizeContactDraft", () => {
  const draft = (over = {}) => ({ ...createContact({ name: "  Jane Doe ", email: " Jane@Acme.com " }, 0), ...over });
  it("trims, normalizes email and US phones", () => {
    const r = finalizeContactDraft(draft(), "(202) 555-0101", "", { keepHue: false });
    expect(r).toMatchObject({ contact: { name: "Jane Doe", email: "jane@acme.com", phone: "+12025550101", mobilePhone: undefined } });
  });
  it("rejects a missing name, bad phones and contacts with no way to reach them", () => {
    expect(finalizeContactDraft(draft({ name: " " }), "", "", { keepHue: false })).toEqual({ error: "Name is required." });
    expect(finalizeContactDraft(draft(), "12345", "", { keepHue: false })).toEqual({ error: "Office phone must be a 10-digit US number." });
    expect(finalizeContactDraft(draft({ email: "" }), "", "", { keepHue: false })).toMatchObject({ error: expect.stringContaining("phone number or an email") });
  });
  it("turns a pasted signature into a saveable contact", () => {
    const sig = parseSignature("Dana Whitfield\nCFO\nBrightPath Logistics\nOffice: (202) 555-0101\nMobile: (202) 555-0102\ndana@brightpath.com");
    const r = finalizeContactDraft(createContact(sig.fields, 3), "(202) 555-0101", "(202) 555-0102", { keepHue: false });
    expect(r).toMatchObject({ contact: { name: "Dana Whitfield", title: "CFO", company: "BrightPath Logistics", email: "dana@brightpath.com", phone: "+12025550101", mobilePhone: "+12025550102", order: 3 } });
  });
});
