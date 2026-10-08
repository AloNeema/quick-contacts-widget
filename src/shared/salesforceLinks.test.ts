import { describe, expect, it } from "vitest";
import { matchSalesforceLinks, salesforceRecordUrl } from "./salesforceLinks";

describe("Salesforce record shortcuts", () => {
  const instance = "https://company.my.salesforce.com";
  const contactId = "003000000000001AAA";
  const leadId = "00Q000000000001AAA";
  it("opens the matched record on the authenticated instance", () => {
    expect(salesforceRecordUrl(instance + "/unused", contactId)).toBe(instance + "/" + contactId);
    expect(salesforceRecordUrl(instance, contactId.slice(0, 15))).toBe(instance + "/" + contactId.slice(0, 15));
  });
  it("does not invent links without an instance or a valid record id", () => {
    expect(salesforceRecordUrl(undefined, contactId)).toBeUndefined();
    for (const id of ["", "003", "../login", contactId + "?other"]) expect(salesforceRecordUrl(instance, id)).toBeUndefined();
  });
  it("rejects unrelated origins, insecure schemes and embedded credentials", () => {
    for (const origin of ["http://company.salesforce.com", "https://salesforce.com.example.org", "https://company.salesforce.com@evil.example", "https://user:pass@company.salesforce.com", "javascript:alert(1)"]) {
      expect(salesforceRecordUrl(origin, contactId)).toBeUndefined();
    }
  });
  it("matches emails case-insensitively and prefers Contacts over Leads", () => {
    const matches = matchSalesforceLinks(instance,
      [{ Id: contactId, Email: " Client@Example.com " }],
      [{ Id: leadId, Email: "client@example.com" }, { Id: leadId, Email: "lead@example.com" }]);
    expect(matches["client@example.com"]).toEqual({ kind: "contact", id: contactId, url: instance + "/" + contactId });
    expect(matches["lead@example.com"]?.kind).toBe("lead");
  });
  it("provides links for inbox clients without a saved widget contact", () => {
    expect(matchSalesforceLinks(instance, [{ Id: contactId, Email: "new@example.com" }], [])["new@example.com"]?.url).toBe(instance + "/" + contactId);
  });
});
