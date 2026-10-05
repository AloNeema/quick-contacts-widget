import type { Contact, ContactSort, IncomingContact, MergeOptions, MergeSummary } from "./types";

/** Stable hue for the initials avatar, derived from the name. */
export function hueForName(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function newContactId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createContact(input: IncomingContact, order: number, now = new Date().toISOString()): Contact {
  return {
    id: newContactId(),
    name: input.name,
    title: input.title,
    company: input.company,
    phone: input.phone,
    mobilePhone: input.mobilePhone,
    email: input.email,
    linkedinUrl: input.linkedinUrl,
    website: input.website,
    group: input.group,
    notes: input.notes,
    photo: input.photoUrl ? { kind: "url", url: input.photoUrl } : undefined,
    hue: hueForName(input.name),
    pinned: false,
    order,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Merge an import into the existing list. Match by email, then phone. On a
 * match, only non-empty incoming fields overwrite; photo, pin state, order and
 * id are never touched (a URL photo is only adopted when the contact has none).
 */
export function mergeContacts(
  existing: Contact[],
  incoming: IncomingContact[],
  options: MergeOptions = { removeMissing: false },
  now = new Date().toISOString(),
): { contacts: Contact[]; summary: MergeSummary } {
  const summary: MergeSummary = { added: 0, updated: 0, skipped: 0, removed: 0 };
  const byEmail = new Map<string, Contact>();
  const byPhone = new Map<string, Contact | null>();
  const indexPhone = (phone: string | undefined, contact: Contact) => {
    if (!phone) return;
    const previous = byPhone.get(phone);
    byPhone.set(phone, previous === undefined || previous?.id === contact.id ? contact : null);
  };
  const result = existing.map((c) => ({ ...c }));
  for (const c of result) {
    if (c.email) byEmail.set(c.email, c);
    indexPhone(c.phone, c);
    indexPhone(c.mobilePhone, c);
  }
  const touched = new Set<string>();
  let nextOrder = result.reduce((m, c) => Math.max(m, c.order), -1) + 1;

  for (const inc of incoming) {
    if (!inc.email && !inc.phone && !inc.mobilePhone) {
      summary.skipped++;
      continue;
    }
    const officeMatch = inc.phone ? byPhone.get(inc.phone) : undefined;
    // Coworkers may share an office line. Different cell numbers identify different people.
    const safeOfficeMatch = officeMatch && inc.mobilePhone && officeMatch.mobilePhone && inc.mobilePhone !== officeMatch.mobilePhone ? undefined : officeMatch;
    const match = (inc.email && byEmail.get(inc.email)) || (inc.mobilePhone && byPhone.get(inc.mobilePhone)) || safeOfficeMatch || undefined;
    if (match) {
      if (touched.has(match.id)) {
        summary.skipped++; // duplicate row inside the file
        continue;
      }
      touched.add(match.id);
      let changed = false;
      const set = <K extends keyof Contact>(k: K, v: Contact[K] | undefined) => {
        if (v !== undefined && v !== "" && match[k] !== v) {
          match[k] = v;
          changed = true;
        }
      };
      set("name", inc.name);
      set("title", inc.title);
      set("company", inc.company);
      set("linkedinUrl", inc.linkedinUrl);
      set("website", inc.website);
      set("group", inc.group);
      if (inc.notes && !match.notes) set("notes", inc.notes); // never overwrite a personal note
      if (inc.email && !match.email) set("email", inc.email);
      if (inc.mobilePhone && inc.mobilePhone === match.phone && !match.mobilePhone && !match.defaultCallPhone && !match.defaultTextPhone) {
        // Older imports stored a mobile column in the single generic phone field.
        set("mobilePhone", inc.mobilePhone);
        match.phone = inc.phone || undefined;
        changed = true;
      } else {
        if (inc.phone && !match.phone) set("phone", inc.phone);
        if (inc.mobilePhone && !match.mobilePhone) set("mobilePhone", inc.mobilePhone);
      }
      if (!match.photo && inc.photoUrl) {
        match.photo = { kind: "url", url: inc.photoUrl };
        changed = true;
      }
      if (changed) {
        match.updatedAt = now;
        summary.updated++;
      }
      if (match.email) byEmail.set(match.email, match);
      indexPhone(match.phone, match);
      indexPhone(match.mobilePhone, match);
      continue;
    }
    const created = createContact(inc, nextOrder++, now);
    result.push(created);
    touched.add(created.id);
    if (created.email) byEmail.set(created.email, created);
    indexPhone(created.phone, created);
    indexPhone(created.mobilePhone, created);
    summary.added++;
  }

  let contacts = result;
  if (options.removeMissing) {
    contacts = result.filter((c) => touched.has(c.id));
    summary.removed = result.length - contacts.length;
  }
  return { contacts: normalizeOrder(contacts), summary };
}

/** Pinned first, then by order; re-number order 0..n-1. */
export function normalizeOrder(contacts: Contact[]): Contact[] {
  return [...contacts]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order)
    .map((c, i) => (c.order === i ? c : { ...c, order: i }));
}

export function moveContact(contacts: Contact[], id: string, direction: -1 | 1): Contact[] {
  const sorted = normalizeOrder(contacts);
  const i = sorted.findIndex((c) => c.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= sorted.length) return sorted;
  if (sorted[i].pinned !== sorted[j].pinned) return sorted; // keep pinned group intact
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  return sorted.map((c, k) => ({ ...c, order: k }));
}

/** Move a person directly to a drop target; hidden contacts and their metadata stay intact. */
export function moveContactTo(contacts: Contact[], id: string, targetId: string, side: "before" | "after", sort: ContactSort = "manual"): Contact[] {
  const sorted = sortContacts(contacts, sort);
  const source = sorted.find((c) => c.id === id);
  const target = sorted.find((c) => c.id === targetId);
  if (!source || !target || id === targetId || source.pinned !== target.pinned) return normalizeOrder(contacts);
  const rest = sorted.filter((c) => c.id !== id);
  const at = rest.findIndex((c) => c.id === targetId) + (side === "after" ? 1 : 0);
  rest.splice(at, 0, source);
  return rest.map((c, order) => c.order === order ? c : { ...c, order });
}

/** People contacted most recently, newest first, for the quick strip. */
export function recentContacts(contacts: Contact[], limit = 6): Contact[] {
  return contacts
    .filter((c) => c.lastContactedAt)
    .sort((a, b) => (b.lastContactedAt! > a.lastContactedAt! ? 1 : b.lastContactedAt! < a.lastContactedAt! ? -1 : (b.contactCount ?? 0) - (a.contactCount ?? 0)))
    .slice(0, limit);
}

export function recordContactUse(contacts: Contact[], id: string, now = new Date().toISOString()): Contact[] {
  return contacts.map((c) => (c.id === id ? { ...c, lastContactedAt: now, contactCount: (c.contactCount ?? 0) + 1 } : c));
}

export function groupsOf(contacts: Contact[]): string[] {
  const counts = new Map<string, number>();
  for (const c of contacts) if (c.group?.trim()) counts.set(c.group.trim(), (counts.get(c.group.trim()) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
}

/** "2h ago", "3d ago", "just now". */
export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}y ago`;
}

const byName = (a: Contact, b: Contact) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
const byRecent = (a: Contact, b: Contact) => (b.lastContactedAt ?? "").localeCompare(a.lastContactedAt ?? "");

/** Pinned contacts stay on top; within each group apply the chosen order. */
export function sortContacts(contacts: Contact[], sort: ContactSort = "manual"): Contact[] {
  const ordered = normalizeOrder(contacts);
  if (sort === "manual") return ordered;
  const cmp =
    sort === "name"
      ? byName
      : sort === "recent"
        ? (a: Contact, b: Contact) => byRecent(a, b) || byName(a, b)
        : (a: Contact, b: Contact) => (b.contactCount ?? 0) - (a.contactCount ?? 0) || byRecent(a, b) || byName(a, b);
  return [...ordered].sort((a, b) => Number(b.pinned) - Number(a.pinned) || cmp(a, b));
}

export function filterContacts(contacts: Contact[], query: string, group?: string, sort: ContactSort = "manual"): Contact[] {
  const q = query.trim().toLowerCase();
  const scoped = group ? contacts.filter((c) => c.group?.trim() === group) : contacts;
  if (!q) return sortContacts(scoped, sort);
  const digits = q.replace(/\D/g, "");
  return sortContacts(scoped, sort).filter((c) =>
    [c.name, c.title, c.company, c.email, c.group, c.notes].some((v) => v?.toLowerCase().includes(q)) ||
    (digits.length >= 3 && [c.phone, c.mobilePhone].some((phone) => phone?.includes(digits))),
  );
}
