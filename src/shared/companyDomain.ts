/**
 * Work out the company domain behind a contact, for fetching its logo.
 * The website field wins; otherwise the email domain, unless it is a
 * personal mailbox provider (gmail.com and friends), which has no company logo.
 */
import type { Contact } from "./types";

export const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "hotmail.com", "outlook.com", "live.com",
  "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me", "pm.me", "gmx.com", "gmx.net",
  "mail.com", "zoho.com", "yandex.com", "fastmail.com", "hey.com", "comcast.net", "verizon.net", "att.net", "sbcglobal.net",
  "bellsouth.net", "cox.net", "charter.net", "earthlink.net", "optonline.net", "frontier.com", "windstream.net",
]);

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://www.Acme-Bank.com/about" -> "acme-bank.com"; returns "" if it is not a usable domain. */
export function normalizeDomain(raw: string | undefined | null): string {
  let v = (raw || "").trim().toLowerCase();
  if (!v) return "";
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0].split("@").pop()!.split(":")[0];
  v = v.replace(/^www\./, "").replace(/\.$/, "");
  return DOMAIN_RE.test(v) ? v : "";
}

export function companyDomainFor(contact: Pick<Contact, "email" | "website">): string {
  const fromSite = normalizeDomain(contact.website);
  if (fromSite) return fromSite;
  const at = (contact.email || "").lastIndexOf("@");
  if (at < 0) return "";
  const domain = normalizeDomain(contact.email!.slice(at + 1));
  return domain && !PERSONAL_EMAIL_DOMAINS.has(domain) ? domain : "";
}

/** Candidate logo URLs for a domain, best quality first. */
export function logoCandidates(domain: string): string[] {
  return [
    `https://${domain}/apple-touch-icon.png`,
    `https://www.${domain}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
  ];
}
