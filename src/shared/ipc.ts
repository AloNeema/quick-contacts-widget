import type { Contact, DialAction, ImportFile, IncomingContact, MergeOptions, MergeSummary, Settings } from "./types";

export const IPC = {
  stateGet: "state:get",
  contactsSave: "contacts:save",
  contactsUpsert: "contacts:upsert",
  contactsDelete: "contacts:delete",
  settingsSet: "settings:set",
  photoPick: "photo:pick",
  photoDelete: "photo:delete",
  photoFromPath: "photo:from-path",
  photoFromUrl: "photo:from-url",
  importPickFile: "import:pick-file",
  importApply: "import:apply",
  dialOpen: "dial:open",
  emailOpen: "email:open",
  linkOpen: "link:open",
  windowResizeBy: "window:resize-by",
  windowHide: "window:hide",
  windowOpenSettings: "window:open-settings",
  windowCloseSettings: "window:close-settings",
  windowToggleAlwaysOnTop: "window:toggle-always-on-top",
  // main -> renderer
  stateChanged: "state:changed",
} as const;

export interface DialRequest {
  action: DialAction;
  phone: string;
}

/** API exposed on window.contacts by the preload script. */
export interface ContactsApi {
  getState(): Promise<{ settings: Settings; contacts: Contact[]; photosBaseUrl: string; platform: string; version: string }>;
  saveContacts(contacts: Contact[]): Promise<Contact[]>;
  upsertContact(contact: Contact): Promise<Contact[]>;
  deleteContact(id: string): Promise<Contact[]>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  pickPhoto(contactId: string): Promise<Contact[] | null>;
  setPhotoFromFile(contactId: string, file: File): Promise<Contact[]>;
  setPhotoFromUrl(contactId: string, url: string): Promise<Contact[]>;
  deletePhoto(contactId: string): Promise<Contact[]>;
  pickImportFile(): Promise<ImportFile | null>;
  applyImport(incoming: IncomingContact[], options: MergeOptions): Promise<{ contacts: Contact[]; summary: MergeSummary }>;
  dial(req: DialRequest): Promise<{ ok: true } | { ok: false; error: string }>;
  email(address: string): Promise<{ ok: true } | { ok: false; error: string }>;
  openLink(url: string): Promise<{ ok: true } | { ok: false; error: string }>;
  resizeBy(dx: number, dy: number): Promise<void>;
  hideWidget(): Promise<void>;
  openSettings(tab?: string): Promise<void>;
  closeSettings(): Promise<void>;
  toggleAlwaysOnTop(): Promise<boolean>;
  onStateChanged(cb: (state: { settings: Settings; contacts: Contact[] }) => void): () => void;
}
