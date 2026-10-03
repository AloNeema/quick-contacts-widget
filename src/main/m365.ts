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
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type ICachePlugin,
  type TokenCacheContext,
} from "@azure/msal-node";
import { M365_SCOPES } from "@shared/defaults";
import type { M365Status, M365SyncSummary, PresenceAvailability, PresenceMap } from "@shared/types";
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
    setStatus({ signedIn: false, lastError: "Session expired, please sign in again." });
    console.warn("acquireTokenSilent failed", err);
    return null;
  }
}

async function graph<T>(accessToken: string, url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Graph ${res.status} on ${url}`);
  return (await res.json()) as T;
}

async function graphPhoto(accessToken: string, url: string): Promise<{ bytes: Buffer; ext: string } | null> {
  const res = await fetch(`${GRAPH}${url}`, { headers: { Authorization: `Bearer ${accessToken}` } });
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
export async function syncContacts(): Promise<{ summary: M365SyncSummary; status: M365Status }> {
  const summary: M365SyncSummary = { matched: 0, photos: 0, updated: 0, unmatched: 0 };
  const accessToken = await token();
  if (!accessToken) return { summary, status: setStatus({ lastError: status.lastError ?? "Not signed in." }) };

  const { includeOutlookContacts } = getState().settings.m365;
  const contacts = getState().contacts.map((c) => ({ ...c }));
  const now = new Date().toISOString();
  await fs.mkdir(photosDir(), { recursive: true });

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
        `/users?$filter=mail eq '${esc(c.email)}' or userPrincipalName eq '${esc(c.email)}'&$select=id,displayName,jobTitle,companyName,mail,userPrincipalName`,
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
      console.warn("Graph lookup failed for", c.email, err);
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

  await setContacts(contacts);
  const next = setStatus({ lastSyncAt: now, lastError: undefined });
  schedulePresence();
  void pollPresence();
  return { summary, status: next };
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
