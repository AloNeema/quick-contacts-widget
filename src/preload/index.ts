import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC, type ContactsApi } from "../shared/ipc";

const api: ContactsApi = {
  getState: () => ipcRenderer.invoke(IPC.stateGet),
  saveContacts: (contacts) => ipcRenderer.invoke(IPC.contactsSave, contacts),
  upsertContact: (contact) => ipcRenderer.invoke(IPC.contactsUpsert, contact),
  deleteContact: (id) => ipcRenderer.invoke(IPC.contactsDelete, id),
  setSettings: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
  pickPhoto: (contactId) => ipcRenderer.invoke(IPC.photoPick, contactId),
  setPhotoFromFile: (contactId, file) => ipcRenderer.invoke(IPC.photoFromPath, contactId, webUtils.getPathForFile(file)),
  setPhotoFromUrl: (contactId, url) => ipcRenderer.invoke(IPC.photoFromUrl, contactId, url),
  deletePhoto: (contactId) => ipcRenderer.invoke(IPC.photoDelete, contactId),
  pickImportFile: () => ipcRenderer.invoke(IPC.importPickFile),
  applyImport: (incoming, options) => ipcRenderer.invoke(IPC.importApply, incoming, options),
  dial: (req) => ipcRenderer.invoke(IPC.dialOpen, req),
  email: (address) => ipcRenderer.invoke(IPC.emailOpen, address),
  openLink: (url) => ipcRenderer.invoke(IPC.linkOpen, url),
  resizeBy: (dx, dy) => ipcRenderer.invoke(IPC.windowResizeBy, dx, dy),
  hideWidget: () => ipcRenderer.invoke(IPC.windowHide),
  openSettings: (tab) => ipcRenderer.invoke(IPC.windowOpenSettings, tab),
  closeSettings: () => ipcRenderer.invoke(IPC.windowCloseSettings),
  toggleAlwaysOnTop: () => ipcRenderer.invoke(IPC.windowToggleAlwaysOnTop),
  onStateChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, state: Parameters<typeof cb>[0]) => cb(state);
    ipcRenderer.on(IPC.stateChanged, listener);
    return () => ipcRenderer.removeListener(IPC.stateChanged, listener);
  },
};

contextBridge.exposeInMainWorld("contacts", api);
