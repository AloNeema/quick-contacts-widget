/**
 * Team contact list: downloads the shared Excel file from OneDrive through this person's own
 * Microsoft 365 sign-in and merges it into their contacts (see @shared/teamList for the rules).
 * Runs with the automatic contact sync (launch, every 30 minutes, after wake) and on demand.
 */
import { singleFlight } from "@shared/autoSync";
import { buildIncomingContacts, guessHeaderMapping, mappingHasRequiredFields } from "@shared/importMapping";
import { applyTeamList, encodeShareUrl, isOneDriveShareUrl } from "@shared/teamList";
import type { TeamListStatus } from "@shared/types";
import { parseWorkbook } from "./importer";
import { teamFilesToken } from "./m365";
import { deletePhotoForContact } from "./photos";
import { getState, setContacts } from "./store";

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_BYTES = 10 * 1024 * 1024;
const SPREADSHEET = /\.(xlsx|xlsm|xls|csv)$/i;

let status: TeamListStatus = { configured: false, syncing: false };
let onStatus: ((s: TeamListStatus) => void) | null = null;
/** Content tag of the file as last applied; an unchanged file is not re-read. */
let appliedTag: string | undefined;
let appliedUrl: string | undefined;

function setStatus(patch: Partial<TeamListStatus>): TeamListStatus {
  status = { ...status, ...patch, configured: Boolean(getState().settings.m365.teamListUrl) };
  onStatus?.(status);
  return status;
}

export function initTeamList(cb: (s: TeamListStatus) => void): void {
  onStatus = cb;
  setStatus({});
}

export function getTeamListStatus(): TeamListStatus {
  return { ...status, configured: Boolean(getState().settings.m365.teamListUrl) };
}

/** The link changed or was cleared: forget what was applied so the next sync reads the new file. */
export function teamListUrlChanged(): TeamListStatus {
  appliedTag = undefined;
  appliedUrl = undefined;
  return setStatus({ error: undefined, needsPermission: undefined, fileName: undefined, count: undefined, lastSyncAt: undefined });
}

function accessError(code: number): string {
  if (code === 401 || code === 403) return "You don't have access to the team list. Ask whoever owns the file to share it with you (or with everyone in the company).";
  if (code === 404) return "The team list link doesn't open a file anymore. Ask for a new link.";
  return `OneDrive answered ${code}. Will retry.`;
}

async function download(url: string, accessToken: string): Promise<{ name: string; tag?: string; bytes?: Buffer } | { error: string }> {
  const base = `${GRAPH}/shares/${encodeShareUrl(url)}/driveItem`;
  // Links shared with "people in your organization" are redeemed on first use so the file opens for this person.
  const headers = { Authorization: `Bearer ${accessToken}`, Prefer: "redeemSharingLinkIfNecessary" };
  const meta = await fetch(`${base}?$select=name,cTag,size,file`, { headers, signal: AbortSignal.timeout(30_000) });
  if (!meta.ok) return { error: accessError(meta.status) };
  const item = (await meta.json()) as { name?: string; cTag?: string; size?: number; file?: unknown };
  const name = item.name ?? "team list";
  if (!item.file) return { error: "The team list link opens a folder. Share the Excel file itself." };
  if (!SPREADSHEET.test(name)) return { error: `${name} isn't an Excel or CSV file.` };
  if ((item.size ?? 0) > MAX_BYTES) return { error: `${name} is larger than 10 MB.` };
  if (item.cTag && item.cTag === appliedTag && url === appliedUrl) return { name, tag: item.cTag };
  // /content redirects to a pre-authorised download URL; fetch drops the Authorization header on that hop.
  const content = await fetch(`${base}/content`, { headers, signal: AbortSignal.timeout(60_000) });
  if (!content.ok) return { error: accessError(content.status) };
  const bytes = Buffer.from(await content.arrayBuffer());
  if (bytes.length > MAX_BYTES) return { error: `${name} is larger than 10 MB.` };
  return { name, tag: item.cTag, bytes };
}

async function performSync(): Promise<{ status: TeamListStatus; changed: boolean }> {
  const url = getState().settings.m365.teamListUrl?.trim();
  if (!url) return { status: setStatus({ syncing: false }), changed: false };
  if (!isOneDriveShareUrl(url)) return { status: setStatus({ error: "That isn't a OneDrive or SharePoint share link." }), changed: false };
  const auth = await teamFilesToken();
  if ("needsPermission" in auth) {
    return { status: setStatus({ needsPermission: true, error: "Allow the widget to read the shared team list (one-time Microsoft prompt)." }), changed: false };
  }
  if ("error" in auth) return { status: setStatus({ error: auth.error }), changed: false };
  setStatus({ syncing: true, needsPermission: undefined });

  const file = await download(url, auth.token);
  if ("error" in file) return { status: setStatus({ syncing: false, error: file.error }), changed: false };
  const done = { syncing: false, error: undefined, fileName: file.name, lastSyncAt: new Date().toISOString() };
  if (!file.bytes) return { status: setStatus(done), changed: false };

  const sheet = parseWorkbook(file.bytes, file.name).sheets[0];
  const guess = sheet ? guessHeaderMapping(sheet.rows) : null;
  if (!guess || !mappingHasRequiredFields(guess.mapping)) {
    return { status: setStatus({ syncing: false, error: `Couldn't find Name and Email or Phone columns on the first sheet of ${file.name}.` }), changed: false };
  }
  const { contacts: incoming } = buildIncomingContacts(guess.dataRows, guess.mapping);
  // An empty or broken sheet must never wipe everyone's team contacts.
  if (incoming.length === 0) return { status: setStatus({ syncing: false, error: `${file.name} has no rows with a name plus an email or phone.` }), changed: false };

  const before = getState().contacts;
  const result = applyTeamList(before, incoming);
  for (const id of result.removedIds) await deletePhotoForContact(before.find((c) => c.id === id));
  await setContacts(result.contacts);
  appliedTag = file.tag;
  appliedUrl = url;
  const count = result.contacts.filter((c) => c.team).length;
  return { status: setStatus({ ...done, count }), changed: true };
}

/** Read the team list now. `changed` says whether contacts were updated and need re-publishing. */
export const syncTeamList = singleFlight(async () => {
  try {
    return await performSync();
  } catch (err) {
    console.warn("team list sync failed", err);
    return { status: setStatus({ syncing: false, error: "Couldn't read the team list just now. Will retry." }), changed: false };
  }
});
