import type { ContactsApi } from "../shared/ipc";

declare global {
  interface Window {
    contacts: ContactsApi;
  }
}

export {};
