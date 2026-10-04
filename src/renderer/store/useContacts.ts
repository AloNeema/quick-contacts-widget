import { create } from "zustand";
import { DEFAULT_SETTINGS } from "@shared/defaults";
import type { Contact, M365Status, PresenceMap, SalesforceStatus, Settings, UpdateStatus } from "@shared/types";

interface ContactsState {
  ready: boolean;
  contacts: Contact[];
  settings: Settings;
  photosBaseUrl: string;
  version: string;
  platform: string;
  presence: PresenceMap;
  m365: M365Status;
  update: UpdateStatus;
  sf: SalesforceStatus;
  toast: { id: number; message: string; tone: "info" | "error" } | null;
  hydrate: () => Promise<void>;
  setContacts: (contacts: Contact[]) => void;
  setSettings: (settings: Settings) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  showToast: (message: string, tone?: "info" | "error") => void;
}

let unsubscribe: (() => void) | null = null;
let unsubscribePresence: (() => void) | null = null;
let unsubscribeM365: (() => void) | null = null;
let unsubscribeUpdate: (() => void) | null = null;
let unsubscribeSf: (() => void) | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useContactsStore = create<ContactsState>((set, get) => ({
  ready: false,
  contacts: [],
  settings: DEFAULT_SETTINGS,
  photosBaseUrl: "",
  version: "",
  platform: "",
  presence: {},
  m365: { configured: false, signedIn: false },
  update: { state: "idle", currentVersion: "", hasToken: false },
  sf: { configured: false, signedIn: false },
  toast: null,
  hydrate: async () => {
    const state = await window.contacts.getState();
    set({ ready: true, contacts: state.contacts, settings: state.settings, photosBaseUrl: state.photosBaseUrl, version: state.version, platform: state.platform });
    unsubscribe?.();
    unsubscribe = window.contacts.onStateChanged((next) => set({ contacts: next.contacts, settings: next.settings }));
    unsubscribePresence?.();
    unsubscribePresence = window.contacts.onPresenceChanged((presence) => set({ presence }));
    unsubscribeM365?.();
    unsubscribeM365 = window.contacts.onM365StatusChanged((m365) => set({ m365 }));
    void window.contacts.getPresence().then((presence) => set({ presence }));
    void window.contacts.m365Status().then((m365) => set({ m365 }));
    unsubscribeUpdate?.();
    unsubscribeUpdate = window.contacts.onUpdateStatusChanged((update) => set({ update }));
    void window.contacts.updateStatus().then((update) => set({ update }));
    unsubscribeSf?.();
    unsubscribeSf = window.contacts.onSfStatusChanged((sf) => set({ sf }));
    void window.contacts.sfStatus().then((sf) => set({ sf }));
  },
  setContacts: (contacts) => set({ contacts }),
  setSettings: (settings) => set({ settings }),
  updateSettings: async (patch) => {
    // optimistic for sliders; main echoes the saved value
    set({ settings: { ...get().settings, ...patch } });
    const saved = await window.contacts.setSettings(patch);
    set({ settings: saved });
  },
  showToast: (message, tone = "info") => {
    if (toastTimer) clearTimeout(toastTimer);
    const id = Date.now();
    set({ toast: { id, message, tone } });
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, tone === "error" ? 5000 : 2500);
  },
}));

export function logoSrc(contact: Contact, photosBaseUrl: string, enabled: boolean): string | undefined {
  if (!enabled || !contact.logo) return undefined;
  return `${photosBaseUrl}${encodeURIComponent(contact.logo.fileName)}`;
}

export function photoSrc(contact: Contact, photosBaseUrl: string): string | undefined {
  if (!contact.photo) return undefined;
  if (contact.photo.kind === "url") return contact.photo.url;
  return `${photosBaseUrl}${encodeURIComponent(contact.photo.fileName)}`;
}
