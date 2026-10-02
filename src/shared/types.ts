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
  photo?: ContactPhoto;
  /** Deterministic hue (0-359) used for the initials avatar. */
  hue: number;
  pinned: boolean;
  order: number;
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

export interface Settings {
  schemaVersion: 1;
  dialer: DialerProvider;
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
  | "ignore";

export interface IncomingContact {
  name: string;
  title?: string;
  company?: string;
  phone?: string;
  email?: string;
  linkedinUrl?: string;
  photoUrl?: string;
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
