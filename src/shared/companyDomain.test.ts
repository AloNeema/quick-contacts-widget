import { describe, expect, it } from "vitest";
import { companyDomainFor, logoCandidates, normalizeDomain } from "./companyDomain";

describe("normalizeDomain", () => {
  it("strips scheme, www, path, port and case", () => {
    expect(normalizeDomain("https://www.Acme-Bank.com/about?x=1")).toBe("acme-bank.com");
    expect(normalizeDomain("acme.co.uk:443")).toBe("acme.co.uk");
    expect(normalizeDomain("www.leecap.com.")).toBe("leecap.com");
  });
  it("rejects junk", () => {
    expect(normalizeDomain("")).toBe("");
    expect(normalizeDomain("not a domain")).toBe("");
    expect(normalizeDomain("localhost")).toBe("");
    expect(normalizeDomain("javascript:alert(1)")).toBe("");
  });
});

describe("companyDomainFor", () => {
  it("uses the email domain for work addresses", () => {
    expect(companyDomainFor({ email: "jane@acmebank.com" })).toBe("acmebank.com");
    expect(companyDomainFor({ email: "Marcus@Mail.LeeCap.com" })).toBe("mail.leecap.com");
  });
  it("skips personal mailbox providers", () => {
    expect(companyDomainFor({ email: "tom.alvarez@gmail.com" })).toBe("");
    expect(companyDomainFor({ email: "x@icloud.com" })).toBe("");
  });
  it("prefers an explicit website", () => {
    expect(companyDomainFor({ email: "tom@gmail.com", website: "alvareztrucking.com" })).toBe("alvareztrucking.com");
    expect(companyDomainFor({ email: "jane@acmebank.com", website: "https://www.acme.com" })).toBe("acme.com");
  });
  it("returns nothing without email or website", () => {
    expect(companyDomainFor({})).toBe("");
  });
});

describe("logoCandidates", () => {
  it("tries the site's own touch icon before favicon services", () => {
    const c = logoCandidates("acme.com");
    expect(c[0]).toBe("https://acme.com/apple-touch-icon.png");
    expect(c.some((u) => u.includes("google.com/s2/favicons") && u.includes("sz=128"))).toBe(true);
  });
});
