import type { Contact } from "./types";

/**
 * Contacts as a vCard 3.0 file (.vcf): the format Google Contacts, Outlook, iPhone and Mac
 * Contacts all import. Text only — photos and app-specific links (Salesforce, Microsoft) stay out.
 */

const CRLF = "\r\n";
const utf8 = new TextEncoder();

/** RFC 6350 §3.4 text escaping: backslash, newline, comma, semicolon. */
function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Fold lines longer than 75 octets (RFC 6350 §3.2) without splitting a UTF-8 character. */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = utf8.encode(ch).length;
    // Continuation lines start with a space, which counts toward their 75 octets.
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join(`${CRLF} `);
}

/** "Jane Q. Doe" -> family "Doe", given "Jane Q."; a single word is the given name. */
export function splitName(full: string): { given: string; family: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { given: words[0] ?? "", family: "" };
  return { given: words.slice(0, -1).join(" "), family: words[words.length - 1] };
}

export function contactToVCard(c: Contact): string {
  const { given, family } = splitName(c.name);
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${esc(family)};${esc(given)};;;`, `FN:${esc(c.name.trim())}`];
  if (c.company) lines.push(`ORG:${esc(c.company)}`);
  if (c.title) lines.push(`TITLE:${esc(c.title)}`);
  if (c.phone) lines.push(`TEL;TYPE=WORK,VOICE${c.defaultCallPhone !== "cell" ? ",PREF" : ""}:${c.phone}`);
  if (c.mobilePhone) lines.push(`TEL;TYPE=CELL${c.defaultCallPhone === "cell" || !c.phone ? ",PREF" : ""}:${c.mobilePhone}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${esc(c.email)}`);
  if (c.website) lines.push(`URL;TYPE=WORK:${c.website}`);
  if (c.linkedinUrl) lines.push(`URL;TYPE=LinkedIn:${c.linkedinUrl}`);
  if (c.group) lines.push(`CATEGORIES:${esc(c.group)}`);
  if (c.notes) lines.push(`NOTE:${esc(c.notes)}`);
  lines.push("END:VCARD");
  return lines.map(fold).join(CRLF);
}

export function contactsToVCard(contacts: Contact[]): string {
  return contacts.filter((c) => c.name.trim()).map(contactToVCard).join(CRLF) + CRLF;
}
