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
  /** Microsoft Graph user id (organization directory) or contact id, set by M365 sync. */
  m365?: { kind: "user" | "contact"; id: string; syncedAt: string };
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

export interface Settings {
  schemaVersion: 1;
  /** Check GitHub Releases for new versions (packaged app only). */
  autoUpdate: boolean;
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
