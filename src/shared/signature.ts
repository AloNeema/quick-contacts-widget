import type { IncomingContact } from "./types";
import { normalizeEmail, normalizeUsPhone } from "./phone";

export const SIGNATURE_LIMIT = 12000;
export interface SignatureDraft {
  fields: IncomingContact;
  source: string;
  warnings: string[];
  emails: string[];
}

const EMAIL = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi;
const PHONE = /(?<![\w+])(?:\+?1[ .-]*)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[ .-]*[2-9]\d{2}[ .-]*\d{4}(?!\d)/g;
const TITLE = /\b(?:VP|SVP|EVP|AVP|CEO|CFO|COO|CTO|president|director|manager|officer|broker|executive|advisor|adviser|consultant|specialist|founder|owner|partner|realtor|associate|representative|underwriter|business development)\b/i;
const COMPANY = /\b(?:bank|capital|funding|lending|mortgage|financial|finance|credit|LLC|inc\.?|corp\.?|corporation|company|group|partners|solutions|services)\b/i;
const NOISE = /^(?:(?:kind|best|warm) regards|regards|sincerely|thanks(?: again)?|thank you|cheers|best|sent from|connect with|follow (?:me|us)|book (?:a |time)|schedule|confidential|privacy|disclaimer|this (?:e-?mail|message)|please (?:consider|note)|NMLS|licen[cs]e|member FDIC|equal housing|https?:|www\.|fax\b)/i;

function possibleName(value: string): boolean {
  const words = value.trim().split(/\s+/);
  return words.length >= 2 && words.length <= 6 && value.length <= 90
    && /^[\p{L}][\p{L}\p{M}'’. -]+$/u.test(value)
    && !TITLE.test(value) && !COMPANY.test(value) && !NOISE.test(value);
}

/** Text-only heuristics. No HTML rendering, network requests, clipboard polling or automatic save. */
export function parseSignature(input: string): SignatureDraft {
  if (input.length > SIGNATURE_LIMIT) throw new Error("Paste just the signature, up to 12,000 characters.");
  const source = input.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  const warnings: string[] = [];
  const allLines = source.split("\n").map(line => line.trim()).filter(Boolean);
  const end = allLines.findIndex(line => /^(?:confidential(?:ity)?\b|disclaimer\b|this (?:e-?mail|message)\b|from:\s|on .+wrote:)/i.test(line));
  const lines = end < 0 ? allLines : allLines.slice(0, end);
  if (end >= 0) warnings.push("Text after a disclaimer or quoted-message header was ignored.");
  const body = lines.join("\n");
  const emails = [...new Set((body.match(EMAIL) ?? []).map(normalizeEmail).filter(Boolean))];
  const fields: IncomingContact = { name: "", email: emails[0] };
  if (emails.length > 1) warnings.push("More than one email address was found. Check which one belongs to this person.");

  const numbers: { phone: string; label: "office" | "cell" | "unknown"; extension?: string }[] = [];
  let faxFound = false;
  for (const line of lines) {
    if (/\+(?!1(?:\D|$))\d/.test(line)) {
      warnings.push("An international number was found. This version supports US-format numbers; check the original signature.");
      continue;
    }
    for (const match of line.matchAll(PHONE)) {
      const before = line.slice(0, match.index);
      const after = line.slice(match.index! + match[0].length);
      if (/\b(?:NMLS(?:\s*(?:ID|#))?|licen[cs]e(?:\s*(?:number|#))?|loan\s*(?:ID|#))\s*[:#-]?\s*$/i.test(before)) continue;
      const prefix = before.match(/\b(office|work|phone|tel|telephone|direct|desk|mobile|cell|text|fax|[pcmodtf])\s*(?:phone|line)?\s*[:.= -]?\s*$/i)?.[1];
      const suffix = after.match(/^\s*\((office|work|direct|mobile|cell|fax|[mcof])\)/i)?.[1];
      const label = (prefix ?? suffix ?? "").toLowerCase();
      if (label === "fax" || label === "f") { faxFound = true; continue; }
      const phone = normalizeUsPhone(match[0]);
      const extension = after.match(/^\s*(?:ext(?:ension)?\.?|x|#)\s*(\d{1,6})\b/i)?.[1];
      const kind = /^(?:mobile|cell|text|m|c)$/.test(label) ? "cell" : label ? "office" : "unknown";
      const existing = numbers.find(n => n.phone === phone);
      if (!existing) numbers.push({ phone, label: kind, extension });
      else if (existing.label === "unknown" && kind !== "unknown") existing.label = kind;
    }
  }
  if (faxFound) warnings.push("Fax numbers were left out of the calling fields.");
  const office = numbers.filter(n => n.label === "office");
  const cells = numbers.filter(n => n.label === "cell");
  const unknown = numbers.filter(n => n.label === "unknown");
  fields.phone = office[0]?.phone;
  fields.mobilePhone = cells[0]?.phone;
  if (!fields.phone && unknown.length) {
    fields.phone = unknown[0].phone;
    warnings.push("An unlabeled number was placed in Office. Check whether it should be Cell instead.");
  }
  if (numbers.some(n => n.phone !== fields.phone && n.phone !== fields.mobilePhone)) warnings.push("There are extra phone numbers in the signature. Choose the Office and Cell numbers you want to keep.");
  const extensions = numbers.filter(n => n.extension);
  if (extensions.length) {
    fields.notes = extensions.map(n => `${n.phone} ext. ${n.extension}`).join("; ").slice(0, 2000);
    warnings.push("Extensions were saved in Notes; enter the extension yourself after dialing.");
  }

  const urls = body.match(/(?:https?:\/\/|www\.)[^\s<>"|]+|(?<![@\w.])[a-z0-9][a-z0-9.-]+\.(?:com|net|org|io|co|us|biz)(?:\/[^\s<>"|]*)?/gi) ?? [];
  for (const raw of urls) {
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw.replace(/[),.;]+$/, "") : `https://${raw.replace(/[),.;]+$/, "")}`);
      if (url.username || url.password || url.href.length > 300) continue;
      if (/(^|\.)linkedin\.com$/i.test(url.hostname)) {
        if (url.pathname.startsWith("/in/") && !fields.linkedinUrl) fields.linkedinUrl = url.href;
      } else if (!/(^|\.)(facebook|instagram|twitter|x|youtube|calendly|aka|safelinks\.protection\.outlook)\.(com|ms)$/i.test(url.hostname) && !fields.website) fields.website = url.href;
    } catch { /* Ignore malformed links. */ }
  }

  const segments = lines.flatMap(line => line.split(/\t+|\s*[|•]\s*| {3,}|,\s*(?=(?:VP|SVP|EVP|Vice President|Director|Manager)\b)/i))
    .map(line => line.replace(EMAIL, "").replace(/[<>]/g, "").replace(/^(?:name|contact)\s*:\s*/i, "").replace(/\s*\((?:she\/her|he\/him|they\/them)\)\s*/i, " ").replace(/,\s*(?:MBA|CPA|CFP|PhD|JD)(?:\s*,.*)?$/i, "").trim())
    .filter(line => line && !NOISE.test(line) && !/[\d@/:=]/.test(line) && !/\.(?:com|net|org|io|co|us|biz)\b/i.test(line));
  const name = segments.find(possibleName);
  fields.name = name ?? "";
  const remaining = segments.filter(line => line !== name);
  fields.title = remaining.find(line => TITLE.test(line) && !COMPANY.test(line)) ?? remaining.find(line => TITLE.test(line));
  fields.company = remaining.find(line => line !== fields.title && COMPANY.test(line));
  if (!fields.company && name) {
    const nameIndex = segments.indexOf(name);
    fields.company = segments.slice(nameIndex + 1).find(line => line !== fields.title && !TITLE.test(line) && line.length <= 100);
  }
  if (!name) warnings.push("The name was unclear. Enter it before adding this contact.");
  if (!fields.email && !fields.phone && !fields.mobilePhone) warnings.push("No usable email address or US phone number was found. Add one in the review form.");
  return { source, fields, emails, warnings: [...new Set(warnings)] };
}
