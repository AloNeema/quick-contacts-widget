/**
 * Spreadsheet -> contacts. The header heuristics are adapted from the mail-merge
 * importer in the main app (src/lib/mailMergeParse.ts) and tuned for a contact
 * list: name / title / company / email / phone / LinkedIn / photo URL.
 */
import type { ImportField, IncomingContact } from "./types";
import { normalizeEmail, normalizeUsPhone } from "./phone";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: "Full name",
  firstName: "First name",
  lastName: "Last name",
  title: "Title",
  company: "Company",
  email: "Email",
  phone: "Office phone",
  mobilePhone: "Cell phone",
  linkedinUrl: "LinkedIn URL",
  photoUrl: "Photo URL",
  website: "Website",
  group: "Group / tag",
  notes: "Notes",
  ignore: "Ignore",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(\s*(x|ext\.?)\s*\d+)?$/i;
const URL_RE = /^https?:\/\//i;

function cell(row: string[] | undefined, i: number): string {
  if (!row || i < 0) return "";
  const v = row[i];
  return v == null ? "" : String(v).trim();
}

/** A header row is short-ish text in every populated cell and contains no emails / phones. */
export function looksLikeHeaderRow(row: string[]): boolean {
  const vals = row.map((v) => (v == null ? "" : String(v).trim())).filter(Boolean);
  if (vals.length < 2) return false;
  if (vals.some((v) => EMAIL_RE.test(v) || PHONE_RE.test(v))) return false;
  return vals.every((v) => v.length <= 40 && /[a-z]/i.test(v));
}

function fieldFromHeader(h: string): ImportField | null {
  const s = h.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (!s) return null;
  if (/linkedin/.test(s)) return "linkedinUrl";
  if (/(photo|avatar|picture|image|headshot)/.test(s)) return "photoUrl";
  if (/^(website|web site|web|url|domain|site|homepage)$/.test(s) || /\b(website|domain|homepage)\b/.test(s)) return "website";
  if (/^(group|tag|tags|category|type|segment|list)$/.test(s) || /\b(group|tag|category)\b/.test(s)) return "group";
  if (/(note|notes|comment|comments|remarks)/.test(s)) return "notes";
  if (/e-?mail/.test(s)) return "email";
  if (/(mobile|cell)/.test(s)) return "mobilePhone";
  if (/(phone|mobile|cell|tel|direct|number)/.test(s)) return "phone";
  if (/^(first|first name|given( name)?|fname)$/.test(s) || /\bfirst\b/.test(s)) return "firstName";
  if (/^(last|last name|surname|family( name)?|lname)$/.test(s) || /\blast\b/.test(s)) return "lastName";
  if (/(title|position|role|job)/.test(s)) return "title";
  if (/(company|business|organi[sz]ation|account|employer|firm|lender|dba)/.test(s)) return "company";
  if (/(full name|^name$|contact|person|who)/.test(s) || /\bname\b/.test(s)) return "name";
  return null;
}

/** Guess a mapping from the column contents when there is no usable header. */
export function guessMappingFromValues(rows: string[][]): ImportField[] {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const mapping: ImportField[] = new Array(width).fill("ignore");
  const claimed = new Set<ImportField>();
  const sample = rows.slice(0, 50);
  const claim = (c: number, f: ImportField) => {
    if (!claimed.has(f)) {
      mapping[c] = f;
      claimed.add(f);
    }
  };
  const isNamey = (s: string) => {
    const words = s.split(/\s+/);
    return words.length >= 2 && words.length <= 4 && /^[\p{L}'’.\- ]+$/u.test(s);
  };
  for (let c = 0; c < width; c++) {
    const vals = sample.map((r) => cell(r, c)).filter(Boolean);
    if (vals.length === 0) continue;
    const ratio = (pred: (s: string) => boolean) => vals.filter(pred).length / vals.length;
    if (ratio((v) => EMAIL_RE.test(v)) >= 0.5) {
      claim(c, "email");
      continue;
    }
    if (ratio((v) => PHONE_RE.test(v)) >= 0.5) {
      claim(c, "phone");
      continue;
    }
    if (ratio((v) => URL_RE.test(v)) >= 0.5) {
      claim(c, vals.some((v) => /linkedin\.com/i.test(v)) ? "linkedinUrl" : "photoUrl");
      continue;
    }
    if (!claimed.has("name") && ratio(isNamey) >= 0.5) {
      claim(c, "name");
      continue;
    }
    if (!claimed.has("company") && ratio((s) => s.split(/\s+/).length >= 2) >= 0.5) {
      claim(c, "company");
    }
  }
  return mapping;
}

export function guessHeaderMapping(rows: string[][]): { mapping: ImportField[]; dataRows: string[][]; hadHeader: boolean } {
  if (rows.length > 1 && looksLikeHeaderRow(rows[0])) {
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const mapping: ImportField[] = new Array(width).fill("ignore");
    const used = new Set<ImportField>();
    rows[0].forEach((h, i) => {
      const f = fieldFromHeader(h == null ? "" : String(h));
      if (f && !used.has(f)) {
        mapping[i] = f;
        used.add(f);
      }
    });
    // "First" + "Last" both present beats a stray "name" column (e.g. "Account Name").
    if (used.has("firstName") && used.has("lastName") && used.has("name")) {
      mapping[mapping.indexOf("name")] = used.has("company") ? "ignore" : "company";
    }
    const dataRows = rows.slice(1);
    const hasKey = mapping.some((f) => f === "email" || f === "phone" || f === "mobilePhone");
    if (!hasKey) {
      // Header words were unhelpful; let the values fill the gaps.
      const byValues = guessMappingFromValues(dataRows);
      byValues.forEach((f, i) => {
        if (mapping[i] === "ignore" && f !== "ignore" && !used.has(f)) {
          mapping[i] = f;
          used.add(f);
        }
      });
    }
    return { mapping, dataRows, hadHeader: true };
  }
  return { mapping: guessMappingFromValues(rows), dataRows: rows, hadHeader: false };
}

export function mappingHasRequiredFields(mapping: ImportField[]): boolean {
  const hasName = mapping.includes("name") || mapping.includes("firstName") || mapping.includes("lastName");
  const hasKey = mapping.includes("email") || mapping.includes("phone") || mapping.includes("mobilePhone");
  return hasName && hasKey;
}

function titleCase(s: string): string {
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s; // already mixed case
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join("");
}

/** Apply a confirmed mapping. A row needs a name plus an email or phone to count. */
export function buildIncomingContacts(dataRows: string[][], mapping: ImportField[]): { contacts: IncomingContact[]; skipped: number } {
  const col = (f: ImportField) => mapping.indexOf(f);
  const iName = col("name");
  const iFirst = col("firstName");
  const iLast = col("lastName");
  const iTitle = col("title");
  const iCompany = col("company");
  const iEmail = col("email");
  const iPhone = col("phone");
  const iMobile = col("mobilePhone");
  const iLinkedin = col("linkedinUrl");
  const iPhoto = col("photoUrl");
  const iWebsite = col("website");
  const iGroup = col("group");
  const iNotes = col("notes");

  const contacts: IncomingContact[] = [];
  let skipped = 0;
  for (const row of dataRows) {
    if (!row || row.every((v) => !v || !String(v).trim())) continue; // blank line, not a skip
    let name = cell(row, iName);
    if (!name) {
      let first = cell(row, iFirst);
      const last = cell(row, iLast);
      if (!first && !last) first = "";
      name = [first, last].filter(Boolean).join(" ");
    } else if (name.includes(",") && !/\d/.test(name) && name.split(",").length === 2) {
      // "Last, First"
      const [last, first] = name.split(",").map((s) => s.trim());
      name = `${first} ${last}`;
    }
    name = titleCase(name.replace(/\s+/g, " ").trim());
    const email = normalizeEmail(cell(row, iEmail));
    const phone = normalizeUsPhone(cell(row, iPhone));
    const mobilePhone = normalizeUsPhone(cell(row, iMobile));
    if (!name || (!email && !phone && !mobilePhone)) {
      skipped++;
      continue;
    }
    const linkedinUrl = cell(row, iLinkedin);
    const photoUrl = cell(row, iPhoto);
    contacts.push({
      name,
      title: cell(row, iTitle) || undefined,
      company: cell(row, iCompany) || undefined,
      email: email || undefined,
      phone: phone || undefined,
      mobilePhone: mobilePhone || undefined,
      linkedinUrl: URL_RE.test(linkedinUrl) ? linkedinUrl : linkedinUrl ? `https://${linkedinUrl.replace(/^\/+/, "")}` : undefined,
      photoUrl: URL_RE.test(photoUrl) ? photoUrl : undefined,
      website: cell(row, iWebsite) || undefined,
      group: cell(row, iGroup) || undefined,
      notes: cell(row, iNotes) || undefined,
    });
  }
  return { contacts, skipped };
}
