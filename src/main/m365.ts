/**
 * Microsoft 365 sync: sign in with the user's own Azure app registration (public
 * client, loopback redirect), then match widget contacts by email against the
 * organization directory and Outlook contacts to pull photos, titles and
 * companies, and poll Teams presence for matched organization users.
 */
import { app, safeStorage, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type ICachePlugin,
  type TokenCacheContext,
} from "@azure/msal-node";
import { M365_SCOPES } from "@shared/defaults";
import { applySyncChanges } from "@shared/merge";
import { singleFlight } from "@shared/autoSync";
import type { MailMessageLite, ContactContext, M365Status, M365SyncSummary, PresenceAvailability, PresenceMap } from "@shared/types";
import { getState, photosDir, setContacts } from "./store";

const GRAPH = "https://graph.microsoft.com/v1.0";
const PRESENCE_INTERVAL_MS = 45_000;

let pca: PublicClientApplication | null = null;
let pcaKey = "";
let status: M365Status = { configured: false, signedIn: false };
let presence: PresenceMap = {};
let presenceTimer: NodeJS.Timeout | null = null;
let onStatus: ((s: M365Status) => void) | null = null;
let onPresence: ((p: PresenceMap) => void) | null = null;

function cachePath(): string {
  return path.join(app.getPath("userData"), "m365-token-cache.bin");
}

/** MSAL cache persisted through Electron safeStorage (DPAPI on Windows). */
const cachePlugin: ICachePlugin = {
  async beforeCacheAccess(ctx: TokenCacheContext) {
    try {
      const buf = await fs.readFile(cachePath());
      const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
      ctx.tokenCache.deserialize(json);
    } catch {
      /* first run */
    }
  },
  async afterCacheAccess(ctx: TokenCacheContext) {
    if (!ctx.cacheHasChanged) return;
    const json = ctx.tokenCache.serialize();
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, "utf8");
    await fs.writeFile(cachePath(), data);
  },
};

function client(): PublicClientApplication | null {
  const { clientId, tenant } = getState().settings.m365;
  if (!clientId) return null;
  const key = `${clientId}|${tenant}`;
  if (!pca || pcaKey !== key) {
    pca = new PublicClientApplication({
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenant || "organizations"}` },
      cache: { cachePlugin },
    });
    pcaKey = key;
  }
  return pca;
}

async function firstAccount(): Promise<AccountInfo | null> {
  const c = client();
  if (!c) return null;
  const accounts = await c.getTokenCache().getAllAccounts();
  return accounts[0] ?? null;
}

function setStatus(patch: Partial<M365Status>): M365Status {
  status = { ...status, ...patch };
  onStatus?.(status);
  return status;
}

export function initM365(hooks: { onStatus: (s: M365Status) => void; onPresence: (p: PresenceMap) => void }): void {
  onStatus = hooks.onStatus;
  onPresence = hooks.onPresence;
  void refreshStatus();
}

export async function refreshStatus(): Promise<M365Status> {
  const configured = Boolean(getState().settings.m365.clientId);
  const account = configured ? await firstAccount() : null;
  const next = setStatus({
    configured,
    signedIn: Boolean(account),
    account: account ? { name: account.name, username: account.username } : undefined,
  });
  schedulePresence();
  return next;
}

export async function signIn(): Promise<M365Status> {
  const c = client();
  if (!c) return setStatus({ configured: false, signedIn: false, lastError: "Enter the Azure app client id first." });
  try {
    const result = await c.acquireTokenInteractive({
      scopes: M365_SCOPES,
      openBrowser: async (url) => {
        await shell.openExternal(url);
      },
      successTemplate: "<html><body style='font-family:Segoe UI,sans-serif;padding:40px'><h2>Signed in</h2><p>You can close this tab and return to QCF Contacts.</p></body></html>",
      errorTemplate: "<html><body style='font-family:Segoe UI,sans-serif;padding:40px'><h2>Sign-in failed</h2><p>Close this tab and try again from QCF Contacts.</p></body></html>",
    });
    setStatus({ lastError: undefined });
    return setStatus({
      configured: true,
      signedIn: true,
      account: result.account ? { name: result.account.name, username: result.account.username } : undefined,
    });
  } catch (err) {
    return setStatus({ lastError: err instanceof Error ? err.message : String(err) });
  } finally {
    schedulePresence();
  }
}

export async function signOut(): Promise<M365Status> {
  const c = client();
  const account = await firstAccount();
  if (c && account) await c.getTokenCache().removeAccount(account);
  await fs.rm(cachePath(), { force: true }).catch(() => undefined);
  presence = {};
  onPresence?.(presence);
  return refreshStatus();
}

async function token(): Promise<string | null> {
  const c = client();
  const account = await firstAccount();
  if (!c || !account) return null;
  try {
    const r: AuthenticationResult = await c.acquireTokenSilent({ account, scopes: M365_SCOPES });
    return r.accessToken;
  } catch (err) {
    console.warn("acquireTokenSilent failed", err);
    // Only an expired or revoked session means signed out. A network blip or service error keeps
    // the account so cached lists (like Clients) stay visible and the next call can retry.
    if (err instanceof InteractionRequiredAuthError) setStatus({ signedIn: false, lastError: "Session expired, please sign in again." });
    else setStatus({ lastError: "Couldn't reach Microsoft 365 just now. Will retry." });
    return null;
  }
}

async function graph<T>(accessToken: string, url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Graph ${res.status} on ${url}`);
  return (await res.json()) as T;
}

async function graphPhoto(accessToken: string, url: string): Promise<{ bytes: Buffer; ext: string } | null> {
  const res = await fetch(`${GRAPH}${url}`, { signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "image/jpeg";
  const ext = type.includes("png") ? ".png" : type.includes("gif") ? ".gif" : ".jpg";
  return { bytes: Buffer.from(await res.arrayBuffer()), ext };
}

interface GraphUser { id: string; displayName?: string; jobTitle?: string | null; companyName?: string | null; mail?: string | null; userPrincipalName?: string; mobilePhone?: string | null; businessPhones?: string[] }
interface GraphContact { id: string; displayName?: string; jobTitle?: string | null; companyName?: string | null; emailAddresses?: { address: string }[]; mobilePhone?: string | null; businessPhones?: string[] }

function esc(v: string): string {
  return v.replace(/'/g, "''");
}

/** Match each widget contact by email: directory first, then Outlook contacts. */
export const syncContacts = singleFlight(async () => {
  try { return await performContactSync(); }
  catch {
    return {
      summary: { matched: 0, photos: 0, updated: 0, unmatched: 0 },
      status: setStatus({ lastError: "Microsoft contact sync could not finish. It will retry automatically, or you can use Sync now." }),
    };
  }
});

async function performContactSync(): Promise<{ summary: M365SyncSummary; status: M365Status }> {
  const summary: M365SyncSummary = { matched: 0, photos: 0, updated: 0, unmatched: 0 };
  const accessToken = await token();
  if (!accessToken) return { summary, status: setStatus({ lastError: status.lastError ?? "Not signed in." }) };

  const { includeOutlookContacts } = getState().settings.m365;
  const snapshot = getState().contacts;
  const contacts = snapshot.map((c) => ({ ...c }));
  const now = new Date().toISOString();
  await fs.mkdir(photosDir(), { recursive: true });

  let lookupFailures = 0;
  let outlook: GraphContact[] | null = null;
  const loadOutlook = async () => {
    if (outlook) return outlook;
    outlook = [];
    let url: string | null = "/me/contacts?$top=200&$select=id,displayName,jobTitle,companyName,emailAddresses,mobilePhone,businessPhones";
    while (url) {
      const page: { value: GraphContact[]; "@odata.nextLink"?: string } | null = await graph(accessToken, url);
      if (!page) break;
      outlook.push(...page.value);
      url = page["@odata.nextLink"] ?? null;
    }
    return outlook;
  };

  for (const c of contacts) {
    if (!c.email) {
      summary.unmatched++;
      continue;
    }
    let changed = false;
    let photoSource: string | null = null;
    let kind: "user" | "contact" | null = null;
    let id = "";

    try {
      const users = await graph<{ value: GraphUser[] }>(
        accessToken,
        // Encode the filter: a raw "+" in an address (nick+deals@...) would be read as a space.
        `/users?$filter=${encodeURIComponent(`mail eq '${esc(c.email)}' or userPrincipalName eq '${esc(c.email)}'`)}&$select=id,displayName,jobTitle,companyName,mail,userPrincipalName`,
      );
      const u = users?.value[0];
      if (u) {
        kind = "user";
        id = u.id;
        if (u.jobTitle && u.jobTitle !== c.title) { c.title = u.jobTitle; changed = true; }
        if (u.companyName && u.companyName !== c.company) { c.company = u.companyName; changed = true; }
        photoSource = `/users/${u.id}/photos/96x96/$value`;
      } else if (includeOutlookContacts) {
        const match = (await loadOutlook()).find((o) => o.emailAddresses?.some((e) => e.address?.toLowerCase() === c.email));
        if (match) {
          kind = "contact";
          id = match.id;
          if (match.jobTitle && match.jobTitle !== c.title) { c.title = match.jobTitle; changed = true; }
          if (match.companyName && match.companyName !== c.company) { c.company = match.companyName; changed = true; }
          photoSource = `/me/contacts/${match.id}/photo/$value`;
        }
      }
    } catch (err) {
      lookupFailures++;
      console.warn("Graph contact lookup failed", err);
    }

    if (!kind) {
      summary.unmatched++;
      continue;
    }
    summary.matched++;
    c.m365 = { kind, id, syncedAt: now };

    // Photos: never overwrite one the user set by hand (file not produced by sync, or a URL).
    const userSet = c.photo && !(c.photo.kind === "file" && c.photo.fileName.includes("-m365-"));
    if (!userSet && photoSource) {
      try {
        const photo = await graphPhoto(accessToken, photoSource);
        if (photo) {
          const fileName = `${c.id}-m365-${Date.now()}${photo.ext}`;
          await fs.writeFile(path.join(photosDir(), fileName), photo.bytes);
          if (c.photo?.kind === "file") await fs.rm(path.join(photosDir(), path.basename(c.photo.fileName)), { force: true }).catch(() => undefined);
          c.photo = { kind: "file", fileName };
          summary.photos++;
          changed = true;
        }
      } catch (err) {
        console.warn("Photo fetch failed for", c.email, err);
      }
    }
    if (changed) {
      c.updatedAt = now;
      summary.updated++;
    }
  }

  // Merge into the latest list: edits made while the sync ran are kept.
  await setContacts(applySyncChanges(getState().contacts, snapshot, contacts, ["title", "company", "m365", "photo", "updatedAt"]));
  const next = lookupFailures
    ? setStatus({ lastError: "Some Microsoft contacts could not be refreshed. Sync will retry automatically." })
    : setStatus({ lastSyncAt: now, lastError: undefined });
  schedulePresence();
  void pollPresence();
  return { summary, status: next };
}

// ---- Outlook context (last email, next meeting) -------------------------

const CONTEXT_TTL_MS = 10 * 60 * 1000;
const CALENDAR_TTL_MS = 5 * 60 * 1000;
const contextCache = new Map<string, ContactContext>();
let calendarCache: { fetchedAt: number; events: GraphEvent[] } | null = null;

interface GraphMessage {
  subject?: string;
  receivedDateTime: string;
  bodyPreview?: string;
  webLink?: string;
  from?: { emailAddress?: { address?: string } };
}
interface GraphEvent {
  subject?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  webLink?: string;
  isCancelled?: boolean;
  location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string } | null;
  attendees?: { emailAddress?: { address?: string } }[];
  organizer?: { emailAddress?: { address?: string } };
}

async function upcomingEvents(accessToken: string): Promise<GraphEvent[]> {
  if (calendarCache && Date.now() - calendarCache.fetchedAt < CALENDAR_TTL_MS) return calendarCache.events;
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  const url = `/me/calendarView?startDateTime=${encodeURIComponent(start.toISOString())}&endDateTime=${encodeURIComponent(end.toISOString())}&$orderby=start/dateTime&$top=100&$select=subject,start,end,webLink,isCancelled,location,onlineMeeting,attendees,organizer`;
  const res = await graph<{ value: GraphEvent[] }>(accessToken, url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
  calendarCache = { fetchedAt: Date.now(), events: (res?.value ?? []).filter((e) => !e.isCancelled) };
  return calendarCache.events;
}

export async function getContactContext(contactId: string): Promise<ContactContext> {
  const cached = contextCache.get(contactId);
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CONTEXT_TTL_MS) return cached;
  const contact = getState().contacts.find((c) => c.id === contactId);
  const base: ContactContext = { contactId, fetchedAt: new Date().toISOString(), available: false };
  if (!contact?.email) return { ...base, error: "No email on this contact" };
  if (!status.signedIn) return { ...base, error: "Sign in to Microsoft 365 to see email and meetings" };
  const accessToken = await token();
  if (!accessToken) return { ...base, error: status.lastError ?? "Not signed in" };

  const email = contact.email.toLowerCase();
  const result: ContactContext = { ...base, available: true };
  try {
    const search = encodeURIComponent(`"participants:${email}"`);
    const msgs = await graph<{ value: GraphMessage[] }>(accessToken, `/me/messages?$search=${search}&$top=1&$select=subject,receivedDateTime,bodyPreview,webLink,from`);
    const m = msgs?.value[0];
    if (m) {
      result.lastEmail = {
        subject: m.subject || "(no subject)",
        receivedAt: m.receivedDateTime,
        direction: m.from?.emailAddress?.address?.toLowerCase() === email ? "in" : "out",
        preview: (m.bodyPreview ?? "").slice(0, 140),
        webLink: m.webLink,
      };
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  try {
    const events = await upcomingEvents(accessToken);
    const ev = events.find((e) => e.attendees?.some((a) => a.emailAddress?.address?.toLowerCase() === email) || e.organizer?.emailAddress?.address?.toLowerCase() === email);
    if (ev) {
      result.nextMeeting = {
        subject: ev.subject || "(no title)",
        start: `${ev.start.dateTime}Z`.replace(/Z?Z$/, "Z"),
        end: `${ev.end.dateTime}Z`.replace(/Z?Z$/, "Z"),
        webLink: ev.webLink,
        joinUrl: ev.onlineMeeting?.joinUrl ?? undefined,
        location: ev.location?.displayName || undefined,
      };
    }
  } catch (err) {
    result.error = result.error ?? (err instanceof Error ? err.message : String(err));
  }
  contextCache.set(contactId, result);
  return result;
}

// ---- Mail for client follow-ups ------------------------------------------

export function isM365SignedIn(): boolean {
  return status.signedIn;
}

interface GraphMailItem {
  id: string;
  conversationId?: string;
  subject?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  bodyPreview?: string;
  webLink?: string;
  inferenceClassification?: "focused" | "other";
  hasAttachments?: boolean;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  ccRecipients?: { emailAddress?: { name?: string; address?: string } }[];
}

type Party = { name?: string; address: string };
const addr = (r?: { emailAddress?: { name?: string; address?: string } }): Party | undefined =>
  r?.emailAddress?.address ? { name: r.emailAddress.name, address: r.emailAddress.address } : undefined;

/** Your own addresses (primary, sign-in name, aliases) so they are never treated as clients. */
export async function myMailAddresses(): Promise<string[]> {
  const accessToken = await token();
  if (!accessToken) return [];
  const me = await graph<{ mail?: string; userPrincipalName?: string; proxyAddresses?: string[] }>(accessToken, "/me?$select=mail,userPrincipalName,proxyAddresses").catch(() => null);
  const list = [me?.mail, me?.userPrincipalName, status.account?.username, ...(me?.proxyAddresses ?? []).map((p) => p.replace(/^smtp:/i, ""))];
  return [...new Set(list.filter((v): v is string => Boolean(v && v.includes("@"))).map((v) => v.toLowerCase()))];
}

/** Inbox (Focused only when Focused Inbox is on) and Sent Items for the last N days, newest first, capped. */
export async function fetchRecentMail(days: number, cap = 3000): Promise<MailMessageLite[]> {
  const accessToken = await token();
  if (!accessToken) throw new Error(status.lastError ?? "Sign in to Microsoft 365 first");
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const out: MailMessageLite[] = [];
  const read = async (folder: "inbox" | "sentitems") => {
    const dateField = folder === "inbox" ? "receivedDateTime" : "sentDateTime";
    let url: string | null =
      `/me/mailFolders/${folder}/messages?$filter=${dateField} ge ${since}&$orderby=${dateField} desc&$top=100` +
      `&$select=id,conversationId,subject,${dateField},bodyPreview,webLink,hasAttachments,from,toRecipients,ccRecipients${folder === "inbox" ? ",inferenceClassification" : ""}`;
    let taken = 0;
    while (url && taken < cap) {
      const page: { value: GraphMailItem[]; "@odata.nextLink"?: string } | null = await graph(accessToken, url);
      if (!page) break;
      for (const m of page.value) {
        taken++;
        if (folder === "inbox") {
          if (m.inferenceClassification === "other") continue; // newsletters and bulk mail land in "Other"
          const from = addr(m.from);
          if (!from) continue;
          out.push({ id: m.id, conversationId: m.conversationId, subject: m.subject ?? "", at: m.receivedDateTime!, direction: "in", from, to: [], hasAttachments: m.hasAttachments, webLink: m.webLink, preview: m.bodyPreview?.slice(0, 160) });
        } else {
          const to = [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])].map(addr).filter((v): v is Party => Boolean(v));
          if (!to.length) continue;
          out.push({ id: m.id, conversationId: m.conversationId, subject: m.subject ?? "", at: m.sentDateTime!, direction: "out", to, webLink: m.webLink, preview: m.bodyPreview?.slice(0, 160) });
        }
      }
      url = page["@odata.nextLink"] ?? null;
    }
  };
  await read("inbox");
  await read("sentitems");
  return out;
}

export function getPresence(): PresenceMap {
  return presence;
}

async function pollPresence(): Promise<void> {
  if (!status.signedIn || !getState().settings.m365.presence) return;
  const ids = getState().contacts.filter((c) => c.m365?.kind === "user").map((c) => c.m365!.id);
  if (ids.length === 0) return;
  const accessToken = await token();
  if (!accessToken) return;
  try {
    const next: PresenceMap = {};
    for (let i = 0; i < ids.length; i += 650) {
      const batch = ids.slice(i, i + 650);
      const res = await graph<{ value: { id: string; availability: PresenceAvailability; activity: string }[] }>(
        accessToken,
        "/communications/getPresencesByUserId",
        { method: "POST", body: JSON.stringify({ ids: batch }) },
      );
      for (const p of res?.value ?? []) next[p.id] = { availability: p.availability, activity: p.activity };
    }
    presence = next;
    onPresence?.(presence);
  } catch (err) {
    console.warn("presence poll failed", err);
  }
}

/** Poll while signed in and presence is enabled; callers invoke after settings/sign-in changes. */
export function schedulePresence(): void {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
  if (!status.signedIn || !getState().settings.m365.presence) {
    if (Object.keys(presence).length) {
      presence = {};
      onPresence?.(presence);
    }
    return;
  }
  void pollPresence();
  presenceTimer = setInterval(() => void pollPresence(), PRESENCE_INTERVAL_MS);
}

/** Convert this mailbox's Graph message ID for Classic Outlook's existing-item API. */
export async function desktopMessageEntryId(messageId: string): Promise<{ entryId: string; addresses: string[] }> {
  const accessToken = await token();
  if (!accessToken) throw new Error("Sign in to Microsoft 365 again before opening this email.");
  const translated = await graph<{ value: Array<{ sourceId?: string; targetId?: string }> }>(accessToken, "/me/translateExchangeIds", {
    method: "POST",
    body: JSON.stringify({ inputIds: [messageId], sourceIdType: "restId", targetIdType: "entryId" }),
  });
  const entryId = translated?.value.find(result => result.sourceId === messageId)?.targetId;
  if (!entryId) throw new Error("This message may have moved. Check your inbox in the widget, then try again.");
  const addresses = await myMailAddresses();
  if (!addresses.length) throw new Error("Could not identify the Microsoft mailbox. Try signing in again.");
  return { entryId, addresses };
}
