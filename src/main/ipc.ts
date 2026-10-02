import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import { z } from "zod";
import { IPC } from "@shared/ipc";
import { buildDialUri, buildLinkedinUri, buildMailtoUri, DialerError } from "@shared/dialer";
import { mergeContacts } from "@shared/merge";
import type { Contact, IncomingContact, MergeOptions, Settings } from "@shared/types";
import { contactSchema, getState, patchSettings, setContacts, settingsPatchSchema } from "./store";
import { deletePhoto, deletePhotoForContact, photosBaseUrl, pickPhoto, setPhotoFromPath, setPhotoFromUrl } from "./photos";
import { pickImportFile } from "./importer";
import { applyLaunchAtLogin } from "./autoLaunch";
import {
  broadcast,
  createSettingsWindow,
  getSettingsWindow,
  getWidgetWindow,
  recreateWidgetWindow,
  resizeWidgetBy,
} from "./windows";
import { refreshTrayMenu } from "./tray";

const incomingSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  linkedinUrl: z.string().optional(),
  photoUrl: z.string().optional(),
});

type Result = { ok: true } | { ok: false; error: string };

function sender(e: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender);
}

function notify(): void {
  const s = getState();
  broadcast(IPC.stateChanged, { settings: s.settings, contacts: s.contacts });
  refreshTrayMenu();
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
    return saved;
  });

  ipcMain.handle(IPC.contactsUpsert, async (_e, raw: unknown) => {
    const contact = contactSchema.parse(raw) as Contact;
    const list = getState().contacts;
    const idx = list.findIndex((c) => c.id === contact.id);
    const next = idx === -1 ? [...list, contact] : list.map((c) => (c.id === contact.id ? contact : c));
    const saved = await setContacts(next);
    notify();
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
    const next = await patchSettings(patch);
    if (patch.alwaysOnTop !== undefined) getWidgetWindow()?.setAlwaysOnTop(next.alwaysOnTop, "normal");
    if (patch.launchAtLogin !== undefined) applyLaunchAtLogin(next.launchAtLogin);
    if (patch.appearance && patch.appearance.acrylic !== prev.appearance.acrylic) recreateWidgetWindow();
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
    return { contacts: getState().contacts, summary };
  });

  ipcMain.handle(IPC.dialOpen, async (_e, raw: unknown): Promise<Result> => {
    const req = z.object({ action: z.enum(["call", "sms"]), phone: z.string() }).parse(raw);
    try {
      const uri = buildDialUri(getState().settings.dialer, req.action, req.phone);
      const result = await openExternalSafe(uri);
      if (!result.ok && req.action === "sms") {
        // No sms: handler registered (common without Phone Link). Leave the number on the clipboard.
        clipboard.writeText(req.phone);
        return { ok: false, error: "No texting app is set up for sms: links. The number was copied to your clipboard." };
      }
      return result;
    } catch (err) {
      return { ok: false, error: err instanceof DialerError ? err.message : "Could not start the call" };
    }
  });

  ipcMain.handle(IPC.emailOpen, async (_e, raw: unknown): Promise<Result> => {
    try {
      return await openExternalSafe(buildMailtoUri(z.string().parse(raw)));
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
  ipcMain.handle(IPC.windowToggleAlwaysOnTop, async () => {
    const next = !getState().settings.alwaysOnTop;
    await patchSettings({ alwaysOnTop: next });
    getWidgetWindow()?.setAlwaysOnTop(next, "normal");
    notify();
    return next;
  });
}
