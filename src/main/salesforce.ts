import { matchSalesforceLinks } from "@shared/salesforceLinks";
/**
 * Salesforce link: OAuth 2.0 authorization-code flow with PKCE against the
 * user's own Connected App (public client, fixed loopback callback), tokens
 * encrypted with safeStorage. Sync matches contacts by email to Salesforce
 * Contacts (then Leads) and snapshots the top open Opportunity on the Account;
 * the drawer fetches live deals on demand.
 */
import { app, safeStorage, shell } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { SALESFORCE_REDIRECT_URI, SALESFORCE_SCOPES } from "@shared/defaults";
import { applySyncChanges } from "@shared/merge";
import { singleFlight } from "@shared/autoSync";
import type { Contact, SalesforceDeal, SalesforceDeals, SalesforceStatus, SalesforceSyncSummary, SalesforceRecordLink } from "@shared/types";
import { getState, setContacts } from "./store";

const API = "v60.0";
const DEALS_TTL_MS = 5 * 60 * 1000;

interface Tokens { accessToken: string; refreshToken?: string; instanceUrl: string; username?: string; idUrl?: string }

let status: SalesforceStatus = { configured: false, signedIn: false };
let tokens: Tokens | null = null;
let notify: ((s: SalesforceStatus) => void) | null = null;
const dealsCache = new Map<string, SalesforceDeals>();

function tokenPath(): string {
  return path.join(app.getPath("userData"), "salesforce-tokens.bin");
}
async function loadTokens(): Promise<Tokens | null> {
  if (tokens) return tokens;
  try {
    const buf = await fs.readFile(tokenPath());
    tokens = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8")) as Tokens;
  } catch {
    tokens = null;
  }
  return tokens;
}
async function saveTokens(t: Tokens | null): Promise<void> {
  tokens = t;
  if (!t) {
    await fs.rm(tokenPath(), { force: true }).catch(() => undefined);
    return;
  }
  const json = JSON.stringify(t);
  await fs.writeFile(tokenPath(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, "utf8"));
}
function set(patch: Partial<SalesforceStatus>): SalesforceStatus {
  status = { ...status, ...patch };
  notify?.(status);
  return status;
}

export function initSalesforce(onChange: (s: SalesforceStatus) => void): void {
  notify = onChange;
  void sfRefreshStatus();
}

export async function sfRefreshStatus(): Promise<SalesforceStatus> {
  const { consumerKey } = getState().settings.salesforce;
  const t = await loadTokens();
  return set({ configured: Boolean(consumerKey), signedIn: Boolean(t?.accessToken), instanceUrl: t?.instanceUrl, username: t?.username });
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** One-shot loopback listener for the OAuth redirect. */
function waitForCode(expectedState: string, timeoutMs = 5 * 60 * 1000): Promise<string> {
  const port = Number(new URL(SALESFORCE_REDIRECT_URI).port);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", SALESFORCE_REDIRECT_URI);
      if (url.pathname !== new URL(SALESFORCE_REDIRECT_URI).pathname) {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><body style="font-family:Segoe UI,sans-serif;padding:40px"><h2>${code && state === expectedState ? "Connected to Salesforce" : "Sign-in failed"}</h2><p>You can close this tab and return to QCF Contacts.</p></body></html>`,
      );
      clearTimeout(timer);
      server.close();
      if (code && state === expectedState) resolve(code);
      else reject(new Error(error ?? "Salesforce sign-in was cancelled"));
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for the browser sign-in"));
    }, timeoutMs);
    server.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not listen on ${SALESFORCE_REDIRECT_URI}: ${err.message}`));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function tokenRequest(loginUrl: string, params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${loginUrl.replace(/\/$/, "")}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json()) as { access_token?: string; refresh_token?: string; instance_url?: string; id?: string; error_description?: string; error?: string };
  if (!res.ok || !body.access_token || !body.instance_url) throw new Error(body.error_description ?? body.error ?? `Token request failed (${res.status})`);
  return { accessToken: body.access_token, refreshToken: body.refresh_token, instanceUrl: body.instance_url, idUrl: body.id };
}

export async function sfSignIn(): Promise<SalesforceStatus> {
  const { consumerKey, loginUrl } = getState().settings.salesforce;
  if (!consumerKey) return set({ configured: false, signedIn: false, lastError: "Enter the Connected App consumer key first." });
  try {
    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    const state = b64url(randomBytes(16));
    const authUrl = new URL(`${loginUrl.replace(/\/$/, "")}/services/oauth2/authorize`);
    authUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: consumerKey,
      redirect_uri: SALESFORCE_REDIRECT_URI,
      scope: SALESFORCE_SCOPES,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      prompt: "login consent",
    }).toString();
    const codePromise = waitForCode(state);
    await shell.openExternal(authUrl.toString());
    const code = await codePromise;
    const t = await tokenRequest(loginUrl, { grant_type: "authorization_code", code, client_id: consumerKey, redirect_uri: SALESFORCE_REDIRECT_URI, code_verifier: verifier });
    // Username from the identity URL, best effort.
    try {
      if (t.idUrl) {
        const id = await fetch(t.idUrl, { headers: { Authorization: `Bearer ${t.accessToken}` } });
        if (id.ok) t.username = ((await id.json()) as { username?: string }).username;
      }
    } catch {
      /* optional */
    }
    await saveTokens(t);
    return set({ configured: true, signedIn: true, instanceUrl: t.instanceUrl, username: t.username, lastError: undefined });
  } catch (err) {
    return set({ lastError: err instanceof Error ? err.message : String(err) });
  }
}

export async function sfSignOut(): Promise<SalesforceStatus> {
  const t = await loadTokens();
  if (t) {
    const { loginUrl } = getState().settings.salesforce;
    await fetch(`${loginUrl.replace(/\/$/, "")}/services/oauth2/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: t.refreshToken ?? t.accessToken }).toString(),
    }).catch(() => undefined);
  }
  await saveTokens(null);
  dealsCache.clear();
  return sfRefreshStatus();
}

async function refreshAccessToken(): Promise<Tokens | null> {
  const t = await loadTokens();
  const { consumerKey, loginUrl } = getState().settings.salesforce;
  if (!t?.refreshToken || !consumerKey) return null;
  try {
    const nt = await tokenRequest(loginUrl, { grant_type: "refresh_token", refresh_token: t.refreshToken, client_id: consumerKey });
    const merged = { ...t, ...nt, refreshToken: nt.refreshToken ?? t.refreshToken };
    await saveTokens(merged);
    return merged;
  } catch (err) {
    set({ signedIn: false, lastError: "Salesforce session expired, please sign in again." });
    console.warn("salesforce refresh failed", err);
    return null;
  }
}

/** SOQL query with one automatic token refresh on 401. */
async function soql<T>(query: string, retried = false): Promise<T[]> {
  const t = await loadTokens();
  if (!t) throw new Error("Not signed in to Salesforce");
  const res = await fetch(`${t.instanceUrl}/services/data/${API}/query?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${t.accessToken}` } });
  if (res.status === 401 && !retried) {
    const nt = await refreshAccessToken();
    if (nt) return soql<T>(query, true);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => [])) as { message?: string }[];
    throw new Error(body[0]?.message ?? `Salesforce ${res.status}`);
  }
  const data = (await res.json()) as { records: T[]; done: boolean };
  return data.records;
}

const soqlStr = (v: string) => `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

interface SfContact { Id: string; Email?: string; AccountId?: string; Account?: { Name?: string } | null }
interface SfLead { Id: string; Email?: string; Company?: string; Status?: string; IsConverted?: boolean }
interface SfOpp { Id: string; Name: string; StageName: string; Amount?: number | null; CloseDate?: string | null; AccountId?: string }

function recordUrl(id: string): string {
  return `${tokens?.instanceUrl ?? ""}/${id}`;
}

async function openDeals(accountId: string): Promise<SfOpp[]> {
  return soql<SfOpp>(`SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunity WHERE AccountId = ${soqlStr(accountId)} AND IsClosed = false ORDER BY CloseDate NULLS LAST, Amount DESC NULLS LAST LIMIT 5`);
}

type TopDeal = NonNullable<Contact["sf"]>["topDeal"];
const topDealOf = (opps: SfOpp[]): TopDeal =>
  opps[0] ? { id: opps[0].Id, name: opps[0].Name, stage: opps[0].StageName, amount: opps[0].Amount ?? undefined, closeDate: opps[0].CloseDate ?? undefined } : undefined;

/** Link every contact with an email to a Salesforce Contact (or Lead) and snapshot its top open deal. */
export const sfSync = singleFlight(performSalesforceSync);

async function performSalesforceSync(): Promise<{ summary: SalesforceSyncSummary; status: SalesforceStatus }> {
  const summary: SalesforceSyncSummary = { linked: 0, unmatched: 0 };
  if (!(await loadTokens())) return { summary, status: set({ lastError: "Not signed in to Salesforce" }) };
  const snapshot = getState().contacts;
  const contacts = snapshot.map((c) => ({ ...c }));
  const emails = [...new Set(contacts.map((c) => c.email).filter((e): e is string => Boolean(e)))];
  if (emails.length === 0) return { summary, status };
  const now = new Date().toISOString();
  try {
    const byEmail = new Map<string, SfContact>();
    const leadByEmail = new Map<string, SfLead>();
    for (let i = 0; i < emails.length; i += 100) {
      const chunk = emails.slice(i, i + 100).map(soqlStr).join(",");
      for (const r of await soql<SfContact>(`SELECT Id, Email, AccountId, Account.Name FROM Contact WHERE Email IN (${chunk})`)) {
        if (r.Email && !byEmail.has(r.Email.toLowerCase())) byEmail.set(r.Email.toLowerCase(), r);
      }
      for (const r of await soql<SfLead>(`SELECT Id, Email, Company, Status FROM Lead WHERE IsConverted = false AND Email IN (${chunk})`)) {
        if (r.Email && !leadByEmail.has(r.Email.toLowerCase())) leadByEmail.set(r.Email.toLowerCase(), r);
      }
    }
    const dealsByAccount = new Map<string, SfOpp[]>();
    for (const c of contacts) {
      if (!c.email) {
        summary.unmatched++;
        continue;
      }
      const sfc = byEmail.get(c.email);
      if (sfc) {
        let opps: SfOpp[] = [];
        if (sfc.AccountId) {
          if (!dealsByAccount.has(sfc.AccountId)) dealsByAccount.set(sfc.AccountId, await openDeals(sfc.AccountId));
          opps = dealsByAccount.get(sfc.AccountId)!;
        }
        c.sf = { kind: "contact", id: sfc.Id, accountId: sfc.AccountId, accountName: sfc.Account?.Name ?? undefined, syncedAt: now, topDeal: topDealOf(opps) };
        if (!c.company && sfc.Account?.Name) c.company = sfc.Account.Name;
        summary.linked++;
        continue;
      }
      const lead = leadByEmail.get(c.email);
      if (lead) {
        c.sf = { kind: "lead", id: lead.Id, accountName: lead.Company, syncedAt: now, topDeal: lead.Status ? { id: lead.Id, name: "Lead", stage: lead.Status } : undefined };
        summary.linked++;
        continue;
      }
      summary.unmatched++;
    }
    // Merge into the latest list: edits made while the sync ran are kept.
    await setContacts(applySyncChanges(getState().contacts, snapshot, contacts, ["sf"]));
    dealsCache.clear();
    return { summary, status: set({ lastSyncAt: now, lastError: undefined }) };
  } catch (err) {
    return { summary, status: set({ lastError: err instanceof Error ? err.message : String(err) }) };
  }
}

export function isSalesforceSignedIn(): boolean {
  return status.signedIn;
}

/** Match inbox clients to actual Contact/Lead records, including those not saved in the widget. */
export async function salesforceClientLinks(emails: string[]): Promise<Record<string, SalesforceRecordLink>> {
  if (!emails.length || !(await loadTokens())) return {};
  const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()))];
  const contacts: Array<{ Id: string; Email?: string }> = [];
  const leads: Array<{ Id: string; Email?: string }> = [];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100).map(soqlStr).join(",");
    contacts.push(...await soql<{ Id: string; Email?: string }>(`SELECT Id, Email FROM Contact WHERE Email IN (${chunk})`));
    leads.push(...await soql<{ Id: string; Email?: string }>(`SELECT Id, Email FROM Lead WHERE IsConverted = false AND Email IN (${chunk})`));
  }
  return matchSalesforceLinks(tokens?.instanceUrl, contacts, leads);
}

/** Live open deals for one linked contact (cached 5 min); also refreshes the row snapshot. */
export async function sfDeals(contactId: string): Promise<SalesforceDeals> {
  const cached = dealsCache.get(contactId);
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < DEALS_TTL_MS) return cached;
  const contact = getState().contacts.find((c) => c.id === contactId);
  const base: SalesforceDeals = { contactId, fetchedAt: new Date().toISOString(), linked: Boolean(contact?.sf), deals: [] };
  if (!contact?.sf) return base;
  if (!(await loadTokens())) return { ...base, error: "Not signed in to Salesforce" };
  const result: SalesforceDeals = { ...base, recordUrl: recordUrl(contact.sf.id), accountName: contact.sf.accountName, accountUrl: contact.sf.accountId ? recordUrl(contact.sf.accountId) : undefined };
  try {
    if (contact.sf.kind === "contact" && contact.sf.accountId) {
      const opps = await openDeals(contact.sf.accountId);
      result.deals = opps.map<SalesforceDeal>((o) => ({ id: o.Id, name: o.Name, stage: o.StageName, amount: o.Amount ?? undefined, closeDate: o.CloseDate ?? undefined, url: recordUrl(o.Id) }));
      const top = topDealOf(opps);
      if (JSON.stringify(top) !== JSON.stringify(contact.sf.topDeal)) {
        await setContacts(getState().contacts.map((c) => (c.id === contactId && c.sf ? { ...c, sf: { ...c.sf, topDeal: top } } : c)));
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  dealsCache.set(contactId, result);
  return result;
}
