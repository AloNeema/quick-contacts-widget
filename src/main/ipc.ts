import { requestAutoSync } from "./autoSync";
import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import { z } from "zod";
import { IPC } from "@shared/ipc";
import { buildLinkedinUri, buildMailtoUri } from "@shared/dialer";
import { dispatchDial } from "./dial";
import { backupAction, backupStatus } from "./backupActions";
import { mergeContacts, moveContactTo, recordContactUse } from "@shared/merge";
import type { Contact, IncomingContact, MergeOptions, Settings } from "@shared/types";
import { contactSchema, getState, patchSettings, setContacts, settingsPatchSchema } from "./store";
import { deletePhoto, deletePhotoForContact, photosBaseUrl, pickPhoto, setPhotoFromPath, setPhotoFromUrl } from "./photos";
import { pickImportFile } from "./importer";
import { applyLaunchAtLogin } from "./autoLaunch";
import {
  applyDockLayout,
  broadcast,
  createSettingsWindow,
  getSettingsWindow,
  getWidgetWindow,
  recreateWidgetWindow,
  resizeWidgetBy,
} from "./windows";
import { refreshTrayMenu } from "./tray";
import { applyHotkey } from "./hotkey";
import { getContactContext, getPresence, refreshStatus, schedulePresence, signIn, signOut, syncContacts } from "./m365";
import { checkForUpdates, getUpdateStatus, installUpdate, rescheduleUpdates, setUpdateToken } from "./updater";
import { refreshLogos } from "./logos";
import { addClientContact, openClientEmail, previewClientEmail, contactsChangedForClients, getClientsState, markClient, markClientsViewed, rescheduleClients, restoreHiddenClients, scanClients } from "./clients";
import { sfDeals, sfRefreshStatus, sfSignIn, sfSignOut, sfSync } from "./salesforce";

const incomingSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  mobilePhone: z.string().optional(),
  email: z.string().optional(),
  linkedinUrl: z.string().optional(),
  photoUrl: z.string().optional(),
  website: z.string().optional(),
  group: z.string().optional(),
  notes: z.string().optional(),
});

type Result = { ok: true; message?: string } | { ok: false; error: string };

function sender(e: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender);
}

function notify(): void {
  const s = getState();
  broadcast(IPC.stateChanged, { settings: s.settings, contacts: s.contacts });
  refreshTrayMenu();
  contactsChangedForClients();
}

/** Fetch logos for any new company domains in the background, then push the update. */
function refreshLogosSoon(): void {
  void refreshLogos()
    .then((n) => n > 0 && notify())
    .catch((err) => console.warn("logo refresh failed", err));
}

async function recordUse(contactId: string | undefined): Promise<void> {
  if (!contactId || !getState().contacts.some((c) => c.id === contactId)) return;
  await setContacts(recordContactUse(getState().contacts, contactId));
  notify();
}

async function openExternalSafe(uri: string): Promise<Result> {
  try {
    await shell.openExternal(uri);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function registerIpc(): void {
  ipcMain.handle(IPC.backupStatus, () => backupStatus());
  ipcMain.handle(IPC.backupAction, (_e, action: unknown) => backupAction(z.enum(["save", "restore", "regular", "folder"]).parse(action)));
  ipcMain.handle(IPC.stateGet, () => {
    const s = getState();
    return { settings: s.settings, contacts: s.contacts, photosBaseUrl: photosBaseUrl(), platform: process.platform, version: app.getVersion() };
  });

  ipcMain.handle(IPC.contactsSave, async (_e, raw: unknown) => {
    const contacts = z.array(contactSchema).parse(raw) as Contact[];
    const before = getState().contacts;
    const keep = new Set(contacts.map((c) => c.id));
    for (const c of before) if (!keep.has(c.id)) await deletePhotoForContact(c);
    const saved = await setContacts(contacts);
    notify();
    refreshLogosSoon();
    return saved;
  });

  ipcMain.handle(IPC.contactsReorder, async (_e, raw: unknown) => {
    const req = z.object({ id: z.string(), targetId: z.string(), side: z.enum(["before", "after"]), sort: z.enum(["manual", "name", "recent", "frequent"]) }).parse(raw);
    const list = getState().contacts;
    const source = list.find((c) => c.id === req.id);
    const target = list.find((c) => c.id === req.targetId);
    if (!source || !target || source.id === target.id) return { contacts: list, settings: getState().settings };
    if (source.pinned !== target.pinned) throw new Error("Pinned contacts stay at the top. Change the pin before moving between sections.");
    // Read the latest contacts here: dragging never sends a stale copy of contact details.
    const contacts = await setContacts(moveContactTo(list, req.id, req.targetId, req.side, req.sort));
    const settings = await patchSettings({ sort: "manual" });
    notify();
    return { contacts, settings };
  });

  ipcMain.handle(IPC.contactsUpsert, async (_e, raw: unknown) => {
    const parsed = contactSchema.parse(raw) as Contact;
    const list = getState().contacts;
    const idx = list.findIndex((c) => c.id === parsed.id);
    // The edit form saves the copy it opened with. Fields it never edits (sync links, logo, photo,
    // pin/order, usage) come from the stored contact so a sync or call made meanwhile isn't undone.
    const stored = idx === -1 ? undefined : list[idx];
    const contact: Contact = stored
      ? { ...parsed, m365: stored.m365, sf: stored.sf, logo: stored.logo, photo: stored.photo, pinned: stored.pinned, order: stored.order, lastContactedAt: stored.lastContactedAt, contactCount: stored.contactCount }
      : parsed;
    const next = idx === -1 ? [...list, contact] : list.map((c) => (c.id === contact.id ? contact : c));
    const saved = await setContacts(next);
    notify();
    refreshLogosSoon();
    return saved;
  });

  ipcMain.handle(IPC.contactsDelete, async (_e, raw: unknown) => {
    const id = z.string().parse(raw);
    const list = getState().contacts;
    await deletePhotoForContact(list.find((c) => c.id === id));
    const saved = await setContacts(list.filter((c) => c.id !== id));
    notify();
    return saved;
  });

  ipcMain.handle(IPC.settingsSet, async (_e, raw: unknown) => {
    const patch = settingsPatchSchema.parse(raw) as Partial<Settings>;
    const prev = getState().settings;
    // Dock geometry is owned by the main process (saved as the window moves); the renderer only
    // toggles enabled/side, and its copy of y/height/width may be stale.
    if (patch.dock) patch.dock = { ...patch.dock, y: prev.dock.y, height: prev.dock.height, width: prev.dock.width };
    const next = await patchSettings(patch);
    if (patch.alwaysOnTop !== undefined) getWidgetWindow()?.setAlwaysOnTop(next.alwaysOnTop, "normal");
    if (patch.launchAtLogin !== undefined) applyLaunchAtLogin(next.launchAtLogin);
    if (patch.appearance && patch.appearance.acrylic !== prev.appearance.acrylic) recreateWidgetWindow();
    if (patch.hotkey !== undefined && patch.hotkey !== prev.hotkey) {
      if (!applyHotkey(next.hotkey)) {
        await patchSettings({ hotkey: prev.hotkey });
        applyHotkey(prev.hotkey);
        notify();
        throw new Error(`"${next.hotkey}" could not be registered. Another app may be using it.`);
      }
    }
    if (patch.autoUpdate !== undefined) rescheduleUpdates();
    if (patch.dock && (patch.dock.enabled !== prev.dock.enabled || patch.dock.side !== prev.dock.side)) applyDockLayout(false);
    if (patch.alwaysOnTop !== undefined && next.dock.enabled) getWidgetWindow()?.setAlwaysOnTop(true, "normal");
    if (patch.salesforce) { await sfRefreshStatus(); requestAutoSync(); }
    if (patch.companyLogos === true && !prev.companyLogos) refreshLogosSoon();
    if (patch.clients) rescheduleClients();
    if (patch.m365) {
      await refreshStatus();
      schedulePresence();
      requestAutoSync();
    }
    notify();
    return next;
  });

  ipcMain.handle(IPC.photoPick, async (e, raw: unknown) => {
    const contactId = z.string().parse(raw);
    const result = await pickPhoto(sender(e), contactId);
    if (result) notify();
    return result;
  });
  ipcMain.handle(IPC.photoFromPath, async (_e, rawId: unknown, rawPath: unknown) => {
    const saved = await setPhotoFromPath(z.string().parse(rawId), z.string().parse(rawPath));
    notify();
    return saved;
  });
  ipcMain.handle(IPC.photoFromUrl, async (_e, rawId: unknown, rawUrl: unknown) => {
    const saved = await setPhotoFromUrl(z.string().parse(rawId), z.string().url().parse(rawUrl));
    notify();
    return saved;
  });
  ipcMain.handle(IPC.photoDelete, async (_e, raw: unknown) => {
    const saved = await deletePhoto(z.string().parse(raw));
    notify();
    return saved;
  });

  ipcMain.handle(IPC.importPickFile, (e) => pickImportFile(sender(e)));
  ipcMain.handle(IPC.importApply, async (_e, rawIncoming: unknown, rawOptions: unknown) => {
    const incoming = z.array(incomingSchema).parse(rawIncoming) as IncomingContact[];
    const options = z.object({ removeMissing: z.boolean() }).parse(rawOptions) as MergeOptions;
    const before = getState().contacts;
    const { contacts, summary } = mergeContacts(before, incoming, options);
    if (options.removeMissing) {
      const keep = new Set(contacts.map((c) => c.id));
      for (const c of before) if (!keep.has(c.id)) await deletePhotoForContact(c);
    }
    await setContacts(contacts);
    notify();
    refreshLogosSoon();
    return { contacts: getState().contacts, summary };
  });

  ipcMain.handle(IPC.dialOpen, async (_e, raw: unknown): Promise<Result> => {
    const req = z.object({ action: z.enum(["call", "sms"]), phone: z.string(), contactId: z.string().optional() }).parse(raw);
    return dispatchDial(getState().settings.dialer, req, {
      openExternal: openExternalSafe,
      copy: phone => clipboard.writeText(phone),
      recordUse,
    });
  });

  ipcMain.handle(IPC.emailOpen, async (_e, raw: unknown, rawId?: unknown): Promise<Result> => {
    try {
      const result = await openExternalSafe(buildMailtoUri(z.string().parse(raw)));
      if (result.ok) await recordUse(z.string().optional().parse(rawId));
      return result;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not open email" };
    }
  });

  ipcMain.handle(IPC.linkOpen, async (_e, raw: unknown): Promise<Result> => {
    try {
      return await openExternalSafe(buildLinkedinUri(z.string().parse(raw)));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not open link" };
    }
  });

  ipcMain.handle(IPC.sfStatus, () => sfRefreshStatus());
  ipcMain.handle(IPC.sfSignIn, async () => {
    const r = await sfSignIn();
    if (r.signedIn) { void scanClients(); requestAutoSync(); }
    return r;
  });
  ipcMain.handle(IPC.sfSignOut, () => sfSignOut());
  ipcMain.handle(IPC.sfSync, async () => {
    const r = await sfSync();
    notify();
    return r;
  });
  ipcMain.handle(IPC.sfDeals, async (_e, raw: unknown) => {
    const id = z.string().parse(raw);
    const topDeal = () => JSON.stringify(getState().contacts.find((c) => c.id === id)?.sf?.topDeal ?? null);
    const before = topDeal();
    const r = await sfDeals(id);
    // Broadcast only when the row snapshot changed: an unconditional notify re-renders the
    // drawer, which asks for deals again and loops.
    if (topDeal() !== before) notify();
    return r;
  });
  ipcMain.handle(IPC.clientsGet, () => getClientsState());
  ipcMain.handle(IPC.clientsScan, () => scanClients());
  ipcMain.handle(IPC.clientsPreviewEmail, (_e, email: unknown, messageId: unknown) =>
    previewClientEmail(z.string().email().parse(email), z.string().min(1).max(8192).parse(messageId)),
  );
  ipcMain.handle(IPC.clientsOpenEmail, (_e, email: unknown, messageId: unknown, action: unknown) =>
    openClientEmail(z.string().email().parse(email), z.string().min(1).max(8192).parse(messageId), z.enum(["open", "reply"]).parse(action)),
  );
  ipcMain.handle(IPC.clientsMark, (_e, rawEmail: unknown, rawAction: unknown) =>
    markClient(z.string().email().parse(rawEmail), z.enum(["hide", "notClient", "restore"]).parse(rawAction)),
  );
  ipcMain.handle(IPC.clientsAddContact, async (_e, raw: unknown) => {
    const saved = await addClientContact(z.string().email().parse(raw));
    notify();
    refreshLogosSoon();
    return saved;
  });
  ipcMain.handle(IPC.clientsRestoreHidden, () => restoreHiddenClients());
  ipcMain.handle(IPC.clientsViewed, () => markClientsViewed());
  ipcMain.handle(IPC.logosRefresh, async (_e, raw: unknown) => {
    const n = await refreshLogos({ force: z.boolean().parse(raw) });
    if (n > 0) notify();
    return n;
  });
  ipcMain.handle(IPC.contextGet, (_e, raw: unknown) => getContactContext(z.string().parse(raw)));
  ipcMain.handle(IPC.dockExpand, (_e, raw: unknown) => {
    if (getState().settings.dock.enabled) applyDockLayout(z.boolean().parse(raw));
  });
  ipcMain.handle(IPC.windowResizeBy, (_e, dx: unknown, dy: unknown) => {
    resizeWidgetBy(z.number().parse(dx), z.number().parse(dy));
  });
  ipcMain.handle(IPC.windowHide, () => {
    getWidgetWindow()?.hide();
    refreshTrayMenu();
  });
  ipcMain.handle(IPC.windowOpenSettings, (_e, tab: unknown) => {
    createSettingsWindow(typeof tab === "string" ? tab : undefined);
  });
  ipcMain.handle(IPC.windowCloseSettings, () => getSettingsWindow()?.close());
  ipcMain.handle(IPC.m365Status, () => refreshStatus());
  ipcMain.handle(IPC.m365SignIn, async () => {
    const s = await signIn();
    if (s.signedIn) { rescheduleClients(); requestAutoSync(); }
    return s;
  });
  ipcMain.handle(IPC.m365SignOut, () => signOut());
  ipcMain.handle(IPC.m365Sync, async () => {
    const r = await syncContacts();
    notify();
    return r;
  });
  ipcMain.handle(IPC.presenceGet, () => getPresence());
  ipcMain.handle(IPC.updateStatus, () => getUpdateStatus());
  ipcMain.handle(IPC.updateCheck, () => checkForUpdates(true));
  ipcMain.handle(IPC.updateInstall, () => installUpdate());
  ipcMain.handle(IPC.updateSetToken, (_e, raw: unknown) => setUpdateToken(z.string().max(200).parse(raw)));
  ipcMain.handle(IPC.windowToggleAlwaysOnTop, async () => {
    const next = !getState().settings.alwaysOnTop;
    await patchSettings({ alwaysOnTop: next });
    getWidgetWindow()?.setAlwaysOnTop(next, "normal");
    notify();
    return next;
  });
}
