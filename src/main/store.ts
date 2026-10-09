import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_SETTINGS, DIALER_PRESETS } from "@shared/defaults";
import type { Contact, PersistedState, Settings } from "@shared/types";
import { normalizeOrder } from "@shared/merge";

const dialerSchema = z.object({
  id: z.enum(["ringcentral", "phonelink", "system", "custom", "talkdesk"]),
  label: z.string(),
  callTemplate: z.string(),
  smsTemplate: z.string(),
});

/** Field limits the saved file is validated against on load; setContacts clamps to them so nothing is dropped on restart. */
export const CONTACT_LIMITS = { website: 300, group: 60, notes: 2000 } as const;

function clampContact(c: Contact): Contact {
  let next = c;
  for (const [k, max] of Object.entries(CONTACT_LIMITS) as [keyof typeof CONTACT_LIMITS, number][]) {
    const v = next[k];
    if (typeof v === "string" && v.length > max) next = { ...next, [k]: v.slice(0, max) };
  }
  return next;
}

export const contactSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  title: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  mobilePhone: z.string().optional(),
  defaultCallPhone: z.enum(["office", "cell"]).optional(),
  defaultTextPhone: z.enum(["office", "cell"]).optional(),
  email: z.string().optional(),
  linkedinUrl: z.string().optional(),
  website: z.string().max(CONTACT_LIMITS.website).optional(),
  logo: z.object({ domain: z.string(), fileName: z.string() }).optional(),
  group: z.string().max(CONTACT_LIMITS.group).optional(),
  notes: z.string().max(CONTACT_LIMITS.notes).optional(),
  m365: z.object({ kind: z.enum(["user", "contact"]), id: z.string(), syncedAt: z.string() }).optional(),
  sf: z
    .object({
      kind: z.enum(["contact", "lead"]),
      id: z.string(),
      accountId: z.string().optional(),
      accountName: z.string().optional(),
      syncedAt: z.string(),
      topDeal: z.object({ id: z.string(), name: z.string(), stage: z.string(), amount: z.number().optional(), closeDate: z.string().optional() }).optional(),
    })
    .optional(),
  photo: z
    .union([
      z.object({ kind: z.literal("file"), fileName: z.string() }),
      z.object({ kind: z.literal("url"), url: z.string() }),
    ])
    .optional(),
  hue: z.number().min(0).max(359),
  pinned: z.boolean(),
  order: z.number(),
  lastContactedAt: z.string().optional(),
  contactCount: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  dialer: dialerSchema,
  sort: z.enum(["manual", "name", "recent", "frequent"]).default("manual"),
  clients: z
    .object({
      enabled: z.boolean(),
      lookbackDays: z.number().int().min(7).max(180),
      internalDomains: z.array(z.string().max(253)).max(50),
      lenderDomains: z.array(z.string().max(253)).max(500),
      useSalesforce: z.boolean(),
    })
    .default(DEFAULT_SETTINGS.clients),
  companyLogos: z.boolean().default(true),
  hotkey: z.string().max(80).default(DEFAULT_SETTINGS.hotkey),
  autoUpdate: z.boolean().default(true),
  salesforce: z
    .object({ consumerKey: z.string().max(300), loginUrl: z.string().url().max(300), showDeals: z.boolean() })
    .default(DEFAULT_SETTINGS.salesforce),
  dock: z
    .object({ enabled: z.boolean(), side: z.enum(["left", "right"]), y: z.number().optional(), height: z.number().optional(), width: z.number().optional() })
    .default(DEFAULT_SETTINGS.dock),
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

export const stateSchema = z.object({
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
let recoveryWriteBlocked = false;

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
      // Recover older imports before validation: previous versions could save overlong fields.
      const loose = JSON.parse(raw) as Partial<PersistedState>;
      const contacts = Array.isArray(loose.contacts)
        ? loose.contacts.flatMap((c) => {
            if (!c || typeof c !== "object" || Array.isArray(c)) return [];
            const recovered = contactSchema.safeParse(clampContact(c));
            return recovered.success ? [recovered.data] : [];
          })
        : [];
      // A bad field must not clear unrelated integration IDs and preferences.
      const settings = structuredClone(DEFAULT_SETTINGS);
      if (loose.settings && typeof loose.settings === "object") {
        for (const key of Object.keys(settingsSchema.shape) as (keyof Settings)[]) {
          const field = settingsSchema.shape[key].safeParse(loose.settings[key]);
          if (field.success && field.data !== undefined) Object.assign(settings, { [key]: field.data });
          else {
            // Recover known subfields independently (for example a valid app ID
            // alongside an invalid tenant) instead of discarding the whole group.
            let schema: z.ZodTypeAny = settingsSchema.shape[key];
            if (schema instanceof z.ZodDefault) schema = schema.removeDefault();
            const raw = loose.settings[key];
            if (schema instanceof z.ZodObject && raw && typeof raw === "object") {
              const recovered = { ...(settings[key] as object) };
              for (const [subkey, subschema] of Object.entries(schema.shape) as [string, z.ZodTypeAny][]) {
                const sub = subschema.safeParse((raw as unknown as Record<string, unknown>)[subkey]);
                if (sub.success && sub.data !== undefined) Object.assign(recovered, { [subkey]: sub.data });
              }
              const checked = schema.safeParse(recovered);
              if (checked.success) Object.assign(settings, { [key]: checked.data });
            }
          }
        }
      }
      state = { settings, contacts };
      // Keep the full original text before persisting repaired fields. If backup fails,
      // show the recovered contacts in memory but leave the original file untouched.
      const backedUp = await fs.copyFile(statePath(), `${statePath()}.corrupt-${Date.now()}`).then(() => true, () => false);
      recoveryWriteBlocked = !backedUp;
      if (backedUp) await saveState();
    }
  } catch (error) {
    state = null;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error("Your saved setup could not be read. It has been left in place; the app will close to protect it.", { cause: error });
    }
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
  if (recoveryWriteBlocked) return Promise.reject(new Error("The original setup could not be backed up. Save a backup from Settings before repairing the file permissions and restarting."));
  const snapshot = JSON.stringify(getState(), null, 2);
  writing = writing.catch(() => undefined).then(async () => {
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
  s.contacts = normalizeOrder(contacts.map(clampContact));
  await saveState();
  return s.contacts;
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = getState();
  s.settings = { ...s.settings, ...patch, schemaVersion: 1 };
  await saveState();
  return s.settings;
}
