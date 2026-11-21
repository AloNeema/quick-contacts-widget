/**
 * Team contact list: one Excel file in OneDrive that every teammate's widget reads through their
 * own Microsoft 365 sign-in. Contacts it adds are marked so they leave again when the list drops
 * them; contacts a person already had are only linked, never removed.
 */
import { mergeContacts } from "./merge";
import { formatPhoneForDisplay } from "./phone";
import type { Contact, IncomingContact } from "./types";

/** OneDrive and SharePoint hosts a share link can come from. */
export function isOneDriveShareUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host === "1drv.ms" || host === "onedrive.live.com" || host === "onedrive.cloud.microsoft" || host.endsWith(".sharepoint.com");
}

/** Graph's sharing-URL encoding: "u!" + unpadded base64url of the link (GET /shares/{id}/driveItem). */
export function encodeShareUrl(raw: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(raw.trim())) binary += String.fromCharCode(byte);
  const b64 = btoa(binary);
  return `u!${b64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-")}`;
}

export interface TeamListSummary {
  added: number;
  updated: number;
  removed: number;
}

/**
 * Bring the team list into this person's contacts. Pins, order, photos and personal notes are kept
 * (mergeContacts never overwrites them). Returns the ids of removed contacts so their photos can go too.
 */
export function applyTeamList(
  existing: Contact[],
  incoming: IncomingContact[],
  now = new Date().toISOString(),
): { contacts: Contact[]; summary: TeamListSummary; removedIds: string[] } {
  const before = new Map(existing.map((c) => [c.id, c]));
  const merged = mergeContacts(existing, incoming, { removeMissing: false }, now);
  const removedIds: string[] = [];
  const contacts: Contact[] = [];
  for (const c of merged.contacts) {
    const previous = before.get(c.id);
    if (merged.touchedIds.has(c.id)) {
      contacts.push({ ...c, team: !previous ? "added" : previous.team ?? "matched" });
    } else if (c.team === "added") {
      removedIds.push(c.id);
    } else if (c.team === "matched") {
      const rest = { ...c };
      delete rest.team;
      contacts.push(rest);
    } else {
      contacts.push(c);
    }
  }
  return {
    contacts: contacts.map((c, i) => ({ ...c, order: i })),
    summary: { added: merged.summary.added, updated: merged.summary.updated, removed: removedIds.length },
    removedIds,
  };
}

/** Column headers the importer recognises, so an exported sheet reads straight back in. */
export const TEAM_LIST_HEADERS = ["Name", "Title", "Company", "Email", "Office Phone", "Cell Phone", "Group", "Website", "LinkedIn", "Notes"] as const;

/** Rows for an Excel export (header first) that the team list sync and the Import tab can both read. */
export function contactsToSheetRows(contacts: Contact[]): string[][] {
  const rows: string[][] = [[...TEAM_LIST_HEADERS]];
  for (const c of contacts) {
    if (!c.name.trim()) continue;
    rows.push([
      c.name.trim(),
      c.title ?? "",
      c.company ?? "",
      c.email ?? "",
      c.phone ? formatPhoneForDisplay(c.phone) : "",
      c.mobilePhone ? formatPhoneForDisplay(c.mobilePhone) : "",
      c.group ?? "",
      c.website ?? "",
      c.linkedinUrl ?? "",
      c.notes ?? "",
    ]);
  }
  return rows;
}
