import type { Contact, DialAction, ImportFile, IncomingContact, M365Status, M365SyncSummary, MergeOptions, MergeSummary, PresenceMap, Settings, UpdateStatus } from "./types";

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
  m365Status: "m365:status",
  m365SignIn: "m365:sign-in",
  m365SignOut: "m365:sign-out",
  m365Sync: "m365:sync",
  presenceGet: "presence:get",
  updateStatus: "update:status",
  updateCheck: "update:check",
  updateInstall: "update:install",
  updateSetToken: "update:set-token",
  // main -> renderer
  stateChanged: "state:changed",
  presenceChanged: "presence:changed",
  focusSearch: "widget:focus-search",
  m365StatusChanged: "m365:status-changed",
  updateStatusChanged: "update:status-changed",
} as const;

export interface DialRequest {
  action: DialAction;
  phone: string;
  /** When set, the contact's last-contacted stamp is updated on success. */
  contactId?: string;
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
  email(address: string, contactId?: string): Promise<{ ok: true } | { ok: false; error: string }>;
  openLink(url: string): Promise<{ ok: true } | { ok: false; error: string }>;
  resizeBy(dx: number, dy: number): Promise<void>;
  hideWidget(): Promise<void>;
  openSettings(tab?: string): Promise<void>;
  closeSettings(): Promise<void>;
  toggleAlwaysOnTop(): Promise<boolean>;
  m365Status(): Promise<M365Status>;
  m365SignIn(): Promise<M365Status>;
  m365SignOut(): Promise<M365Status>;
  m365Sync(): Promise<{ summary: M365SyncSummary; status: M365Status }>;
  getPresence(): Promise<PresenceMap>;
  updateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  installUpdate(): Promise<void>;
  setUpdateToken(token: string): Promise<UpdateStatus>;
  onUpdateStatusChanged(cb: (status: UpdateStatus) => void): () => void;
  onStateChanged(cb: (state: { settings: Settings; contacts: Contact[] }) => void): () => void;
  onPresenceChanged(cb: (presence: PresenceMap) => void): () => void;
  onFocusSearch(cb: () => void): () => void;
  onM365StatusChanged(cb: (status: M365Status) => void): () => void;
}
