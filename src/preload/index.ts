import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC, type ContactsApi } from "../shared/ipc";

const api: ContactsApi = {
  backupStatus: () => ipcRenderer.invoke(IPC.backupStatus),
  backupAction: (action) => ipcRenderer.invoke(IPC.backupAction, action),
  getState: () => ipcRenderer.invoke(IPC.stateGet),
  saveContacts: (contacts) => ipcRenderer.invoke(IPC.contactsSave, contacts),
  reorderContact: (id, targetId, side, sort) => ipcRenderer.invoke(IPC.contactsReorder, { id, targetId, side, sort }),
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
  email: (address, contactId) => ipcRenderer.invoke(IPC.emailOpen, address, contactId),
  openLink: (url) => ipcRenderer.invoke(IPC.linkOpen, url),
  resizeBy: (dx, dy) => ipcRenderer.invoke(IPC.windowResizeBy, dx, dy),
  hideWidget: () => ipcRenderer.invoke(IPC.windowHide),
  openSettings: (tab) => ipcRenderer.invoke(IPC.windowOpenSettings, tab),
  closeSettings: () => ipcRenderer.invoke(IPC.windowCloseSettings),
  toggleAlwaysOnTop: () => ipcRenderer.invoke(IPC.windowToggleAlwaysOnTop),
  m365Status: () => ipcRenderer.invoke(IPC.m365Status),
  m365SignIn: () => ipcRenderer.invoke(IPC.m365SignIn),
  m365SignOut: () => ipcRenderer.invoke(IPC.m365SignOut),
  m365Sync: () => ipcRenderer.invoke(IPC.m365Sync),
  getPresence: () => ipcRenderer.invoke(IPC.presenceGet),
  updateStatus: () => ipcRenderer.invoke(IPC.updateStatus),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck),
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  setUpdateToken: (token) => ipcRenderer.invoke(IPC.updateSetToken, token),
  dockExpand: (expanded) => ipcRenderer.invoke(IPC.dockExpand, expanded),
  getContext: (contactId) => ipcRenderer.invoke(IPC.contextGet, contactId),
  refreshLogos: (force) => ipcRenderer.invoke(IPC.logosRefresh, force === true),
  getClients: () => ipcRenderer.invoke(IPC.clientsGet),
  scanClients: () => ipcRenderer.invoke(IPC.clientsScan),
  openClientEmail: (email, messageId, action) => ipcRenderer.invoke(IPC.clientsOpenEmail, email, messageId, action),
  markClient: (email, action) => ipcRenderer.invoke(IPC.clientsMark, email, action),
  addClientContact: (email) => ipcRenderer.invoke(IPC.clientsAddContact, email),
  restoreHiddenClients: () => ipcRenderer.invoke(IPC.clientsRestoreHidden),
  markClientsViewed: () => ipcRenderer.invoke(IPC.clientsViewed),
  onClientsChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, s: Parameters<typeof cb>[0]) => cb(s);
    ipcRenderer.on(IPC.clientsChanged, listener);
    return () => ipcRenderer.removeListener(IPC.clientsChanged, listener);
  },
  onShowTab: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, t: Parameters<typeof cb>[0]) => cb(t);
    ipcRenderer.on(IPC.widgetShowTab, listener);
    return () => ipcRenderer.removeListener(IPC.widgetShowTab, listener);
  },
  sfStatus: () => ipcRenderer.invoke(IPC.sfStatus),
  sfSignIn: () => ipcRenderer.invoke(IPC.sfSignIn),
  sfSignOut: () => ipcRenderer.invoke(IPC.sfSignOut),
  sfSync: () => ipcRenderer.invoke(IPC.sfSync),
  sfDeals: (contactId) => ipcRenderer.invoke(IPC.sfDeals, contactId),
  onSfStatusChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, s: Parameters<typeof cb>[0]) => cb(s);
    ipcRenderer.on(IPC.sfStatusChanged, listener);
    return () => ipcRenderer.removeListener(IPC.sfStatusChanged, listener);
  },
  onUpdateStatusChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, s: Parameters<typeof cb>[0]) => cb(s);
    ipcRenderer.on(IPC.updateStatusChanged, listener);
    return () => ipcRenderer.removeListener(IPC.updateStatusChanged, listener);
  },
  onPresenceChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p);
    ipcRenderer.on(IPC.presenceChanged, listener);
    return () => ipcRenderer.removeListener(IPC.presenceChanged, listener);
  },
  onFocusSearch: (cb) => {
    const listener = () => cb();
    ipcRenderer.on(IPC.focusSearch, listener);
    return () => ipcRenderer.removeListener(IPC.focusSearch, listener);
  },
  onM365StatusChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, s: Parameters<typeof cb>[0]) => cb(s);
    ipcRenderer.on(IPC.m365StatusChanged, listener);
    return () => ipcRenderer.removeListener(IPC.m365StatusChanged, listener);
  },
  onStateChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, state: Parameters<typeof cb>[0]) => cb(state);
    ipcRenderer.on(IPC.stateChanged, listener);
    return () => ipcRenderer.removeListener(IPC.stateChanged, listener);
  },
};

contextBridge.exposeInMainWorld("contacts", api);
