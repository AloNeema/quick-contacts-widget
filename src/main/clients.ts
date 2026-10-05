/**
 * Clients service: every 15 minutes while signed in to Microsoft 365, read
 * recent Inbox and Sent Items, keep the people who look like clients (see
 * src/shared/clients.ts), check them against Salesforce, and track who is new
 * since you last opened the Clients tab. Hidden / "not a client" choices and
 * first-seen times live in clients.json.
 */
import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildCandidates, computeClients, domainOf, excludedLenderDomains, stampFirstSeen } from "@shared/clients";
import { createContact } from "@shared/merge";
import type { ClientCandidate, ClientMark, ClientsState, Contact } from "@shared/types";
import { fetchRecentMail, isM365SignedIn, myMailAddresses } from "./m365";
import { isSalesforceSignedIn, salesforceEmailMatches } from "./salesforce";
import { getState, setContacts } from "./store";

const SCAN_EVERY_MS = 15 * 60 * 1000;

interface Persisted {
  candidates: ClientCandidate[];
  salesforce: string[];
  marks: Record<string, ClientMark>;
  /** email -> when they first made the client list (drives the "new" badge). */
  firstSeen: Record<string, string>;
  lastViewedAt?: string;
  lastScanAt?: string;
}

let data: Persisted = { candidates: [], salesforce: [], marks: {}, firstSeen: {} };
let loaded = false;
let scanning = false;
let lastError: string | undefined;
let timer: NodeJS.Timeout | null = null;
let onChange: ((s: ClientsState) => void) | null = null;

const file = () => path.join(app.getPath("userData"), "clients.json");

async function load(): Promise<void> {
  if (loaded) return;
  try {
    data = { ...data, ...JSON.parse(await fs.readFile(file(), "utf8")) };
  } catch {
    /* first run */
  }
  loaded = true;
}

let saving: Promise<void> = Promise.resolve();
function save(): Promise<void> {
  const snapshot = JSON.stringify(data);
  saving = saving.then(async () => {
    const tmp = `${file()}.tmp`;
    await fs.writeFile(tmp, snapshot, "utf8");
    await fs.rename(tmp, file());
  });
  return saving;
}

export function getClientsState(): ClientsState {
  const { settings, contacts } = getState();
  if (!settings.clients.enabled) return { items: [], newCount: 0, hiddenCount: 0, scanning: false, lastScanAt: data.lastScanAt };
  const { items, hiddenCount } = computeClients(data.candidates, contacts, data.marks, new Set(data.salesforce), data.firstSeen, data.lastViewedAt);
  return { items, newCount: items.filter((i) => i.isNew).length, hiddenCount, lastScanAt: data.lastScanAt, scanning, error: lastError };
}

function emit(): ClientsState {
  const s = getClientsState();
  onChange?.(s);
  return s;
}

export async function initClients(cb: (s: ClientsState) => void): Promise<void> {
  onChange = cb;
  await load();
  emit();
  rescheduleClients();
}

export function rescheduleClients(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (!getState().settings.clients.enabled) {
    emit();
    return;
  }
  setTimeout(() => void scanClients(), 8_000);
  timer = setInterval(() => void scanClients(), SCAN_EVERY_MS);
}

export async function scanClients(): Promise<ClientsState> {
  await load();
  const cfg = getState().settings.clients;
  if (!cfg.enabled || scanning) return getClientsState();
  if (!isM365SignedIn()) {
    lastError = "Sign in to Microsoft 365 (Settings › Microsoft 365) so the widget can find clients in your inbox.";
    return emit();
  }
  scanning = true;
  emit();
  try {
    const mine = await myMailAddresses();
    const internal = cfg.internalDomains.length ? cfg.internalDomains : [...new Set(mine.map(domainOf))];
    const lenders = excludedLenderDomains(cfg.lenderDomains, getState().contacts);
    const messages = await fetchRecentMail(cfg.lookbackDays);
    data.candidates = buildCandidates(messages, { myAddresses: mine, internalDomains: internal, lenderDomains: lenders });
    if (cfg.useSalesforce && isSalesforceSignedIn()) {
      try {
        data.salesforce = [...(await salesforceEmailMatches(data.candidates.filter((c) => c.inboundCount > 0).map((c) => c.email)))];
      } catch (err) {
        console.warn("salesforce client lookup failed", err);
      }
    }
    // Stamp first-seen for anyone newly on the list. The very first scan seeds silently so the badge starts at zero.
    const firstScan = !data.lastScanAt;
    const now = new Date().toISOString();
    const { items } = computeClients(data.candidates, getState().contacts, data.marks, new Set(data.salesforce), data.firstSeen, data.lastViewedAt);
    stampFirstSeen(data.firstSeen, items.map((i) => i.email), firstScan, now);
    if (firstScan) data.lastViewedAt = now;
    data.lastScanAt = now;
    lastError = undefined;
    await save();
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  } finally {
    scanning = false;
  }
  return emit();
}

export async function markClient(email: string, action: "hide" | "notClient" | "restore"): Promise<ClientsState> {
  await load();
  const key = email.toLowerCase();
  if (action === "restore") delete data.marks[key];
  else if (action === "hide") data.marks[key] = { hiddenAt: new Date().toISOString() };
  else data.marks[key] = { notClient: true };
  await save();
  return emit();
}

export async function restoreHiddenClients(): Promise<number> {
  await load();
  const n = Object.keys(data.marks).length;
  data.marks = {};
  await save();
  emit();
  return n;
}

export async function markClientsViewed(): Promise<ClientsState> {
  await load();
  data.lastViewedAt = new Date().toISOString();
  await save();
  return emit();
}

/** "Keep": add the client to the contact list. */
export async function addClientContact(email: string): Promise<Contact[]> {
  await load();
  const key = email.toLowerCase();
  const { contacts } = getState();
  if (contacts.some((c) => c.email === key)) return contacts;
  const cand = data.candidates.find((x) => x.email === key);
  const created = createContact({ name: cand?.name ?? key, email: key }, contacts.length);
  const saved = await setContacts([...contacts, created]);
  emit();
  return saved;
}

/** Contacts changed (new contact, group edits): recompute without rescanning. */
export function contactsChangedForClients(): void {
  if (loaded) emit();
}
