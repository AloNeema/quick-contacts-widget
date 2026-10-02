import { dialog, net, protocol, BrowserWindow } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { photosDir, getState, setContacts } from "./store";
import type { Contact } from "@shared/types";

export const PHOTO_SCHEME = "qcf-photo";
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export function registerPhotoScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: PHOTO_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** qcf-photo://photos/<fileName> -> userData/photos/<fileName>. Only basenames are served. */
export function handlePhotoScheme(): void {
  protocol.handle(PHOTO_SCHEME, (request) => {
    const url = new URL(request.url);
    const fileName = path.basename(decodeURIComponent(url.pathname));
    if (!fileName || !IMAGE_EXT.has(path.extname(fileName).toLowerCase())) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(path.join(photosDir(), fileName)).toString());
  });
}

export function photosBaseUrl(): string {
  return `${PHOTO_SCHEME}://photos/`;
}

async function removeExistingFile(contact: Contact | undefined): Promise<void> {
  if (contact?.photo?.kind === "file") {
    await fs.rm(path.join(photosDir(), path.basename(contact.photo.fileName)), { force: true }).catch(() => undefined);
  }
}

async function applyPhotoFile(contactId: string, sourcePath: string): Promise<Contact[]> {
  const ext = path.extname(sourcePath).toLowerCase();
  if (!IMAGE_EXT.has(ext)) throw new Error("Unsupported image type");
  const stat = await fs.stat(sourcePath);
  if (stat.size > MAX_PHOTO_BYTES) throw new Error("Image is larger than 8 MB");
  const state = getState();
  const contact = state.contacts.find((c) => c.id === contactId);
  if (!contact) throw new Error("Contact not found");
  await fs.mkdir(photosDir(), { recursive: true });
  await removeExistingFile(contact);
  const fileName = `${contactId}-${Date.now()}${ext}`;
  await fs.copyFile(sourcePath, path.join(photosDir(), fileName));
  const now = new Date().toISOString();
  return setContacts(
    state.contacts.map((c) => (c.id === contactId ? { ...c, photo: { kind: "file", fileName }, updatedAt: now } : c)),
  );
}

export async function pickPhoto(parent: BrowserWindow | null, contactId: string): Promise<Contact[] | null> {
  const result = await dialog.showOpenDialog(parent ?? undefined!, {
    title: "Choose a profile photo",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return applyPhotoFile(contactId, result.filePaths[0]);
}

export async function setPhotoFromPath(contactId: string, filePath: string): Promise<Contact[]> {
  return applyPhotoFile(contactId, filePath);
}

export async function setPhotoFromUrl(contactId: string, url: string): Promise<Contact[]> {
  const parsed = new URL(url.trim());
  if (parsed.protocol !== "https:") throw new Error("Photo URL must start with https://");
  const state = getState();
  const contact = state.contacts.find((c) => c.id === contactId);
  if (!contact) throw new Error("Contact not found");
  await removeExistingFile(contact);
  const now = new Date().toISOString();
  return setContacts(
    state.contacts.map((c) => (c.id === contactId ? { ...c, photo: { kind: "url", url: parsed.toString() }, updatedAt: now } : c)),
  );
}

export async function deletePhoto(contactId: string): Promise<Contact[]> {
  const state = getState();
  const contact = state.contacts.find((c) => c.id === contactId);
  await removeExistingFile(contact);
  const now = new Date().toISOString();
  return setContacts(state.contacts.map((c) => (c.id === contactId ? { ...c, photo: undefined, updatedAt: now } : c)));
}

/** Drop photo files that no longer belong to any contact (e.g. after a delete). */
export async function deletePhotoForContact(contact: Contact | undefined): Promise<void> {
  await removeExistingFile(contact);
}
