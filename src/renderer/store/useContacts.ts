import { create } from "zustand";
import { DEFAULT_SETTINGS } from "@shared/defaults";
import type { Contact, Settings } from "@shared/types";

interface ContactsState {
  ready: boolean;
  contacts: Contact[];
  settings: Settings;
  photosBaseUrl: string;
  version: string;
  platform: string;
  toast: { id: number; message: string; tone: "info" | "error" } | null;
  hydrate: () => Promise<void>;
  setContacts: (contacts: Contact[]) => void;
  setSettings: (settings: Settings) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  showToast: (message: string, tone?: "info" | "error") => void;
}

let unsubscribe: (() => void) | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useContactsStore = create<ContactsState>((set, get) => ({
  ready: false,
  contacts: [],
  settings: DEFAULT_SETTINGS,
  photosBaseUrl: "",
  version: "",
  platform: "",
  toast: null,
  hydrate: async () => {
    const state = await window.contacts.getState();
    set({ ready: true, contacts: state.contacts, settings: state.settings, photosBaseUrl: state.photosBaseUrl, version: state.version, platform: state.platform });
    unsubscribe?.();
    unsubscribe = window.contacts.onStateChanged((next) => set({ contacts: next.contacts, settings: next.settings }));
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

export function photoSrc(contact: Contact, photosBaseUrl: string): string | undefined {
  if (!contact.photo) return undefined;
  if (contact.photo.kind === "url") return contact.photo.url;
  return `${photosBaseUrl}${encodeURIComponent(contact.photo.fileName)}`;
}
