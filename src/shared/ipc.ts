import type { ClientEmailPreview, ClientsState, Contact, ContactContext, DialAction, ImportFile, IncomingContact, M365Status, M365SyncSummary, MergeOptions, MergeSummary, PresenceMap, SalesforceDeals, SalesforceStatus, SalesforceSyncSummary, Settings, UpdateStatus } from "./types";

export const IPC = {
  backupStatus: "backup:status",
  backupAction: "backup:action",
  stateGet: "state:get",
  contactsSave: "contacts:save",
  contactsReorder: "contacts:reorder",
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
  dockExpand: "dock:expand",
  contextGet: "context:get",
  logosRefresh: "logos:refresh",
  clientsGet: "clients:get",
  clientsScan: "clients:scan",
  clientsOpenEmail: "clients:open-email",
  clientsPreviewEmail: "clients:preview-email",
  clientsMark: "clients:mark",
  clientsAddContact: "clients:add-contact",
  clientsRestoreHidden: "clients:restore-hidden",
  clientsViewed: "clients:viewed",
  clientsChanged: "clients:changed",
  widgetShowTab: "widget:show-tab",
  sfStatus: "sf:status",
  sfSignIn: "sf:sign-in",
  sfSignOut: "sf:sign-out",
  sfSync: "sf:sync",
  sfDeals: "sf:deals",
  // main -> renderer
  stateChanged: "state:changed",
  presenceChanged: "presence:changed",
  focusSearch: "widget:focus-search",
  m365StatusChanged: "m365:status-changed",
  updateStatusChanged: "update:status-changed",
  sfStatusChanged: "sf:status-changed",
} as const;

export interface DialRequest {
  action: DialAction;
  phone: string;
  /** When set, the contact's last-contacted stamp is updated on success. */
  contactId?: string;
}

/** API exposed on window.contacts by the preload script. */
export interface ContactsApi {
  backupStatus(): Promise<{ preview: boolean; error?: string }>;
  backupAction(action: "save" | "restore" | "regular" | "folder"): Promise<{ message?: string }>;
  getState(): Promise<{ settings: Settings; contacts: Contact[]; photosBaseUrl: string; platform: string; version: string }>;
  saveContacts(contacts: Contact[]): Promise<Contact[]>;
  reorderContact(id: string, targetId: string, side: "before" | "after", sort: Settings["sort"]): Promise<{ contacts: Contact[]; settings: Settings }>;
  upsertContact(contact: Contact): Promise<Contact[]>;
  deleteContact(id: string): Promise<Contact[]>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  pickPhoto(contactId: string): Promise<Contact[] | null>;
  setPhotoFromFile(contactId: string, file: File): Promise<Contact[]>;
  setPhotoFromUrl(contactId: string, url: string): Promise<Contact[]>;
  deletePhoto(contactId: string): Promise<Contact[]>;
  pickImportFile(): Promise<ImportFile | null>;
  applyImport(incoming: IncomingContact[], options: MergeOptions): Promise<{ contacts: Contact[]; summary: MergeSummary }>;
  dial(req: DialRequest): Promise<{ ok: true; message?: string } | { ok: false; error: string }>;
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
  /** Dock mode: grow the strip into the full panel (true) or shrink back (false). */
  dockExpand(expanded: boolean): Promise<void>;
  /** Last email and next meeting with this person from Outlook (needs Microsoft 365 sign-in). */
  getContext(contactId: string): Promise<ContactContext>;
  /** Re-fetch company logos; force ignores the cache. Resolves to the number of contacts updated. */
  refreshLogos(force?: boolean): Promise<number>;
  getClients(): Promise<ClientsState>;
  scanClients(): Promise<ClientsState>;
  openClientEmail(email: string, messageId: string, action: "open" | "reply"): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Read a listed client's latest email (plain text) for the in-widget preview. */
  previewClientEmail(email: string, messageId: string): Promise<{ ok: true; preview: ClientEmailPreview } | { ok: false; error: string }>;
  /** hide: off the list until they email again; notClient: never show; restore: undo either. */
  markClient(email: string, action: "hide" | "notClient" | "restore"): Promise<ClientsState>;
  addClientContact(email: string): Promise<Contact[]>;
  /** Bring back everyone hidden or marked "not a client". Resolves to how many. */
  restoreHiddenClients(): Promise<number>;
  /** The Clients tab was opened: clears the "new" badge. */
  markClientsViewed(): Promise<ClientsState>;
  onClientsChanged(cb: (state: ClientsState) => void): () => void;
  onShowTab(cb: (tab: "contacts" | "clients") => void): () => void;
  sfStatus(): Promise<SalesforceStatus>;
  sfSignIn(): Promise<SalesforceStatus>;
  sfSignOut(): Promise<SalesforceStatus>;
  sfSync(): Promise<{ summary: SalesforceSyncSummary; status: SalesforceStatus }>;
  sfDeals(contactId: string): Promise<SalesforceDeals>;
  onSfStatusChanged(cb: (status: SalesforceStatus) => void): () => void;
  onUpdateStatusChanged(cb: (status: UpdateStatus) => void): () => void;
  onStateChanged(cb: (state: { settings: Settings; contacts: Contact[] }) => void): () => void;
  onPresenceChanged(cb: (presence: PresenceMap) => void): () => void;
  onFocusSearch(cb: () => void): () => void;
  onM365StatusChanged(cb: (status: M365Status) => void): () => void;
}
