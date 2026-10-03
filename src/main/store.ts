import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_SETTINGS, DIALER_PRESETS } from "@shared/defaults";
import type { Contact, PersistedState, Settings } from "@shared/types";
import { normalizeOrder } from "@shared/merge";

const dialerSchema = z.object({
  id: z.enum(["ringcentral", "phonelink", "system", "custom"]),
  label: z.string(),
  callTemplate: z.string(),
  smsTemplate: z.string(),
});

export const contactSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  title: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  linkedinUrl: z.string().optional(),
  m365: z.object({ kind: z.enum(["user", "contact"]), id: z.string(), syncedAt: z.string() }).optional(),
  photo: z
    .union([
      z.object({ kind: z.literal("file"), fileName: z.string() }),
      z.object({ kind: z.literal("url"), url: z.string() }),
    ])
    .optional(),
  hue: z.number().min(0).max(359),
  pinned: z.boolean(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  dialer: dialerSchema,
  hotkey: z.string().max(80).default(DEFAULT_SETTINGS.hotkey),
  m365: z
    .object({
      clientId: z.string().max(200),
      tenant: z.string().min(1).max(200),
      presence: z.boolean(),
      includeOutlookContacts: z.boolean(),
    })
    .default(DEFAULT_SETTINGS.m365),
  alwaysOnTop: z.boolean(),
  launchAtLogin: z.boolean(),
  appearance: z.object({
    opacity: z.number().min(0.2).max(1),
    blur: z.number().min(0).max(40),
    accentHue: z.number().min(0).max(359),
    theme: z.enum(["dark", "light"]),
    acrylic: z.boolean(),
    density: z.enum(["comfortable", "compact"]),
  }),
  bounds: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
});

export const settingsPatchSchema = settingsSchema.partial().omit({ schemaVersion: true });

const stateSchema = z.object({
  settings: settingsSchema,
  contacts: z.array(contactSchema),
});

export function statePath(): string {
  return path.join(app.getPath("userData"), "state.json");
}

export function photosDir(): string {
  return path.join(app.getPath("userData"), "photos");
}

let state: PersistedState | null = null;

function freshState(): PersistedState {
  return { settings: structuredClone(DEFAULT_SETTINGS), contacts: [] };
}

export async function loadState(): Promise<PersistedState> {
  if (state) return state;
  try {
    const raw = await fs.readFile(statePath(), "utf8");
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      state = parsed.data;
    } else {
      // Keep what we can rather than wiping the user's list.
      const loose = JSON.parse(raw) as Partial<PersistedState>;
      const contacts = Array.isArray(loose.contacts)
        ? loose.contacts.filter((c) => contactSchema.safeParse(c).success)
        : [];
      const settings = settingsSchema.safeParse(loose.settings).success ? (loose.settings as Settings) : structuredClone(DEFAULT_SETTINGS);
      state = { settings, contacts };
      await fs.copyFile(statePath(), `${statePath()}.corrupt-${Date.now()}`).catch(() => undefined);
      await saveState();
    }
  } catch {
    state = freshState();
  }
  // Presets may evolve; refresh non-custom dialers from the current table.
  const d = state.settings.dialer;
  if (d.id !== "custom" && DIALER_PRESETS[d.id]) state.settings.dialer = DIALER_PRESETS[d.id];
  state.contacts = normalizeOrder(state.contacts);
  return state;
}

export function getState(): PersistedState {
  if (!state) throw new Error("State not loaded");
  return state;
}

let writing: Promise<void> = Promise.resolve();

/** Atomic write: temp file in the same dir, then rename over the real file. */
export function saveState(): Promise<void> {
  const snapshot = JSON.stringify(getState(), null, 2);
  writing = writing.then(async () => {
    const target = statePath();
    await fs.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, snapshot, "utf8");
    await fs.rename(tmp, target);
  });
  return writing;
}

export async function setContacts(contacts: Contact[]): Promise<Contact[]> {
  const s = getState();
  s.contacts = normalizeOrder(contacts);
  await saveState();
  return s.contacts;
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = getState();
  s.settings = { ...s.settings, ...patch, schemaVersion: 1 };
  await saveState();
  return s.settings;
}
