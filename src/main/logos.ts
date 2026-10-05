/**
 * Company logos: one fetch per company domain, cached on disk next to the
 * photos (logo-<domain>.png) with a small index so misses are not retried
 * for a week. Logos never replace a personal photo; the avatar shows them
 * only when there is none.
 */
import { app, nativeImage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { companyDomainFor, logoCandidates } from "@shared/companyDomain";
import type { Contact } from "@shared/types";
import { getState, photosDir, setContacts } from "./store";

const MISS_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const HIT_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 1_000_000;
const MIN_PX = 32;
const CONCURRENCY = 4;

type IndexEntry = { fileName?: string; fetchedAt: number };
let index: Record<string, IndexEntry> | null = null;
let running: Promise<number> | null = null;

function indexPath(): string {
  return path.join(app.getPath("userData"), "logo-index.json");
}

async function loadIndex(): Promise<Record<string, IndexEntry>> {
  if (index) return index;
  try {
    index = JSON.parse(await fs.readFile(indexPath(), "utf8"));
  } catch {
    index = {};
  }
  return index!;
}

async function saveIndex(): Promise<void> {
  if (index) await fs.writeFile(indexPath(), JSON.stringify(index), "utf8").catch(() => undefined);
}

export type Fetcher = (url: string) => Promise<Response>;

/** First candidate that returns a real image of at least 32px wins; it is re-encoded as PNG. */
export async function fetchLogo(domain: string, fetcher: Fetcher = (u) => fetch(u, { redirect: "follow", signal: AbortSignal.timeout(8000) })): Promise<Buffer | null> {
  for (const url of logoCandidates(domain)) {
    try {
      const res = await fetcher(url);
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      if (type && !type.startsWith("image/") && !type.includes("octet-stream")) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 100 || bytes.length > MAX_BYTES) continue;
      const img = nativeImage.createFromBuffer(bytes);
      if (img.isEmpty()) continue;
      const { width, height } = img.getSize();
      if (Math.min(width, height) < MIN_PX) continue;
      return img.toPNG();
    } catch {
      /* try the next source */
    }
  }
  return null;
}

const fileFor = (domain: string) => `logo-${domain.replace(/[^a-z0-9.-]/g, "_")}.png`;

/** Fill in / refresh logos for every contact. Returns how many contacts changed. Safe to call often. */
export function refreshLogos(opts: { force?: boolean; fetcher?: Fetcher } = {}): Promise<number> {
  if (running) return running;
  running = (async () => {
    if (!getState().settings.companyLogos) return 0;
    const idx = await loadIndex();
    const now = Date.now();
    const domains = new Set<string>();
    for (const c of getState().contacts) {
      const d = companyDomainFor(c);
      if (d) domains.add(d);
    }
    const todo = [...domains].filter((d) => {
      const e = idx[d];
      if (!e || opts.force) return true;
      return e.fileName ? now - e.fetchedAt > HIT_REFRESH_MS : now - e.fetchedAt > MISS_RETRY_MS;
    });
    await fs.mkdir(photosDir(), { recursive: true });
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      await Promise.all(
        todo.slice(i, i + CONCURRENCY).map(async (domain) => {
          const png = await fetchLogo(domain, opts.fetcher);
          if (png) {
            const fileName = fileFor(domain);
            await fs.writeFile(path.join(photosDir(), fileName), png);
            idx[domain] = { fileName, fetchedAt: now };
          } else {
            // A miss (site down, rate limit) keeps a logo we already have; it is retried on the next refresh.
            const prev = idx[domain]?.fileName;
            idx[domain] = prev ? { fileName: prev, fetchedAt: now } : { fetchedAt: now };
          }
        }),
      );
    }
    if (todo.length) await saveIndex();
    return applyLogos(idx);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Point each contact at its domain's cached logo (or clear a stale one). */
async function applyLogos(idx: Record<string, IndexEntry>): Promise<number> {
  let changed = 0;
  const next: Contact[] = getState().contacts.map((c) => {
    const d = companyDomainFor(c);
    const fileName = d ? idx[d]?.fileName : undefined;
    const want = d && fileName ? { domain: d, fileName } : undefined;
    if (JSON.stringify(want) === JSON.stringify(c.logo)) return c;
    changed++;
    return { ...c, logo: want };
  });
  if (changed) await setContacts(next);
  return changed;
}
