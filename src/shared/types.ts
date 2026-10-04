/** Shared data model for the QCF Contacts widget (main, preload and renderer). */

export type DialAction = "call" | "sms";

export type DialerProviderId = "ringcentral" | "phonelink" | "system" | "custom";

export interface DialerProvider {
  id: DialerProviderId;
  label: string;
  /** URI template. Placeholders: {e164} (+15551234567), {digits} (15551234567), {national} (5551234567). */
  callTemplate: string;
  smsTemplate: string;
}

export type ContactPhoto =
  | { kind: "file"; fileName: string }
  | { kind: "url"; url: string };

export interface Contact {
  id: string;
  name: string;
  title?: string;
  company?: string;
  /** E.164, e.g. +15551234567. */
  phone?: string;
  /** Lower-cased. */
  email?: string;
  linkedinUrl?: string;
  /** Free-form group such as "Lenders" or "Brokers"; drives the filter chips. */
  group?: string;
  /** One-line personal note. */
  notes?: string;
  photo?: ContactPhoto;
  /** Company website, used for the logo when the email is on a personal domain. */
  website?: string;
  /** Company logo fetched from the email / website domain; shown when there is no personal photo. */
  logo?: { domain: string; fileName: string };
  /** Microsoft Graph user id (organization directory) or contact id, set by M365 sync. */
  m365?: { kind: "user" | "contact"; id: string; syncedAt: string };
  /** Salesforce link set by sync: the Contact (or Lead) and its Account, plus a snapshot of the top open deal. */
  sf?: {
    kind: "contact" | "lead";
    id: string;
    accountId?: string;
    accountName?: string;
    syncedAt: string;
    topDeal?: { id: string; name: string; stage: string; amount?: number; closeDate?: string };
  };
  /** Deterministic hue (0-359) used for the initials avatar. */
  hue: number;
  pinned: boolean;
  order: number;
  /** Set whenever a Call / Text / Email action is used for this person. */
  lastContactedAt?: string;
  contactCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Appearance {
  /** 0.2 - 1 panel background opacity. */
  opacity: number;
  /** 0 - 40 px backdrop blur. */
  blur: number;
  /** Accent hue 0-359. */
  accentHue: number;
  theme: "dark" | "light";
  /** Try the Windows 11 acrylic material behind the window. */
  acrylic: boolean;
  /** Avatar + row size. */
  density: "comfortable" | "compact";
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface M365Settings {
  /** Azure app registration (public client) client id. */
  clientId: string;
  /** "organizations", "common", or a tenant id / domain. */
  tenant: string;
  /** Poll Teams presence for synced organization users while the widget is visible. */
  presence: boolean;
  /** Also sync Outlook personal contacts (/me/contacts). */
  includeOutlookContacts: boolean;
}

export interface M365Status {
  configured: boolean;
  signedIn: boolean;
  account?: { name?: string; username: string };
  lastSyncAt?: string;
  lastError?: string;
}

export type PresenceAvailability = "Available" | "Busy" | "DoNotDisturb" | "Away" | "BeRightBack" | "Offline" | "PresenceUnknown";
export type PresenceMap = Record<string, { availability: PresenceAvailability; activity: string }>;

/** Live Outlook context for one person, fetched on demand and cached briefly. */
export interface ContactContext {
  contactId: string;
  fetchedAt: string;
  available: boolean;
  error?: string;
  lastEmail?: { subject: string; receivedAt: string; direction: "in" | "out"; preview: string; webLink?: string };
  nextMeeting?: { subject: string; start: string; end: string; webLink?: string; joinUrl?: string; location?: string };
}

export interface SalesforceSettings {
  /** Connected App consumer key (public client with PKCE, no secret). */
  consumerKey: string;
  /** https://login.salesforce.com, https://test.salesforce.com or your My Domain URL. */
  loginUrl: string;
  /** Show the top open deal under the name. */
  showDeals: boolean;
}

export interface SalesforceStatus {
  configured: boolean;
  signedIn: boolean;
  instanceUrl?: string;
  username?: string;
  lastSyncAt?: string;
  lastError?: string;
}

export interface SalesforceDeal {
  id: string;
  name: string;
  stage: string;
  amount?: number;
  closeDate?: string;
  url: string;
}

export interface SalesforceDeals {
  contactId: string;
  fetchedAt: string;
  linked: boolean;
  recordUrl?: string;
  accountUrl?: string;
  accountName?: string;
  deals: SalesforceDeal[];
  error?: string;
}

export interface SalesforceSyncSummary {
  linked: number;
  unmatched: number;
}

export interface M365SyncSummary {
  matched: number;
  photos: number;
  updated: number;
  unmatched: number;
}

export interface UpdateStatus {
  state: "idle" | "checking" | "available" | "downloading" | "ready" | "up-to-date" | "error" | "disabled";
  currentVersion: string;
  version?: string;
  percent?: number;
  error?: string;
  checkedAt?: string;
  hasToken: boolean;
}

export interface DockSettings {
  enabled: boolean;
  side: "left" | "right";
  /** Strip position/height on the docked display; unset = centred, 70% of the work area. */
  y?: number;
  height?: number;
}

export type ContactSort = "manual" | "name" | "recent" | "frequent";

export interface ClientSettings {
  enabled: boolean;
  /** How far back to read Inbox and Sent Items; the list scrolls back this far. */
  lookbackDays: number;
  /** Your own company domains (never clients). Empty = your sign-in domain. */
  internalDomains: string[];
  /** Lender and partner domains (never clients). Domains of contacts in a "Lenders" group are added automatically. */
  lenderDomains: string[];
  /** Treat anyone whose email is a Salesforce Contact or Lead as a client. */
  useSalesforce: boolean;
}

/** One message reduced to what client detection needs. */
export interface MailMessageLite {
  id: string;
  conversationId?: string;
  subject: string;
  at: string;
  direction: "in" | "out";
  from?: { name?: string; address: string };
  to: { name?: string; address: string }[];
  hasAttachments?: boolean;
  webLink?: string;
  preview?: string;
}

/** Everything recent with one outside person, plus why they look like a client. */
export interface ClientCandidate {
  email: string;
  name: string;
  domain: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  /** Latest message either way; the list is sorted by this. */
  lastActivityAt: string;
  lastSubject: string;
  lastPreview?: string;
  lastDirection: "in" | "out";
  webLink?: string;
  inboundCount: number;
  outboundCount: number;
  /** Inbound messages that carried attachments. */
  attachmentMessages: number;
  /** They answered something you sent them. */
  repliedToYou: boolean;
}

export type ClientReason = "salesforce" | "replied" | "attachments" | "repeat" | "conversation";

export interface ClientItem extends ClientCandidate {
  contactId?: string;
  inSalesforce: boolean;
  reasons: ClientReason[];
  /** They wrote last. */
  waitingOnYou: boolean;
  /** Appeared since you last opened the Clients tab. */
  isNew: boolean;
}

export interface ClientMark {
  /** Hidden from the list; comes back only if they email again after this time. */
  hiddenAt?: string;
  /** "Not a client": never show again. */
  notClient?: boolean;
}

export interface ClientsState {
  items: ClientItem[];
  newCount: number;
  hiddenCount: number;
  lastScanAt?: string;
  scanning: boolean;
  error?: string;
}

export interface Settings {
  schemaVersion: 1;
  /** Order of the widget list. Pinned contacts always stay on top. */
  sort: ContactSort;
  clients: ClientSettings;
  /** Show the company website logo when a contact has no photo. */
  companyLogos: boolean;
  dock: DockSettings;
  /** Check GitHub Releases for new versions (packaged app only). */
  autoUpdate: boolean;
  salesforce: SalesforceSettings;
  dialer: DialerProvider;
  /** Electron accelerator that shows the widget and focuses search, "" to disable. */
  hotkey: string;
  m365: M365Settings;
  alwaysOnTop: boolean;
  launchAtLogin: boolean;
  appearance: Appearance;
  bounds?: WindowBounds;
}

export interface PersistedState {
  settings: Settings;
  contacts: Contact[];
}

/** Columns a spreadsheet column can map to during import. */
export type ImportField =
  | "name"
  | "firstName"
  | "lastName"
  | "title"
  | "company"
  | "email"
  | "phone"
  | "linkedinUrl"
  | "photoUrl"
  | "website"
  | "group"
  | "notes"
  | "ignore";

export interface IncomingContact {
  name: string;
  title?: string;
  company?: string;
  phone?: string;
  email?: string;
  linkedinUrl?: string;
  photoUrl?: string;
  website?: string;
  group?: string;
  notes?: string;
}

export interface ImportSheet {
  name: string;
  rows: string[][];
}

export interface ImportFile {
  fileName: string;
  sheets: ImportSheet[];
}

export interface MergeOptions {
  removeMissing: boolean;
}

export interface MergeSummary {
  added: number;
  updated: number;
  skipped: number;
  removed: number;
}
