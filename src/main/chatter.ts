/**
 * To-do tab: Chatter posts and replies that @mention you, fetched from Salesforce every few
 * minutes. "Done" is kept on this computer (Chatter has no done state); optionally the post is
 * liked so the person who tagged you sees it was handled. Replies post as Chatter comments.
 */
import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { extractMentionTodos, mergeTodos, type ChatterTodo, type ConnectFeedElement } from "@shared/chatterTodo";
import type { TodoItem, TodosState } from "@shared/types";
import { getState } from "./store";
import { isSalesforceSignedIn, salesforceInstanceUrl, sfRequest, soql } from "./salesforce";

const REFRESH_MS = 5 * 60 * 1000;
const PAGE = 50;

interface Saved {
  items: ChatterTodo[];
  /** id -> when you checked it off. */
  done: Record<string, string>;
  /** Contact details of the people who tagged you, by Salesforce user id. */
  people: Record<string, { email?: string; phone?: string }>;
  lastFetchAt?: string;
}

let data: Saved = { items: [], done: {}, people: {} };
let loaded = false;
let fetching = false;
let lastError: string | undefined;
let timer: NodeJS.Timeout | null = null;
let myId: string | undefined;
let onChange: ((s: TodosState) => void) | null = null;

const file = () => path.join(app.getPath("userData"), "todos.json");

async function load(): Promise<void> {
  if (loaded) return;
  try {
    const parsed = JSON.parse(await fs.readFile(file(), "utf8")) as Partial<Saved>;
    data = { items: parsed.items ?? [], done: parsed.done ?? {}, people: parsed.people ?? {}, lastFetchAt: parsed.lastFetchAt };
  } catch {
    /* first run */
  }
  loaded = true;
}

async function save(): Promise<void> {
  const tmp = `${file()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file());
}

export function getTodosState(): TodosState {
  const items: TodoItem[] = data.items.map((t) => ({ ...t, doneAt: data.done[t.id], authorEmail: data.people[t.authorId]?.email, authorPhone: data.people[t.authorId]?.phone }));
  return {
    items,
    openCount: items.filter((i) => !i.doneAt).length,
    signedIn: isSalesforceSignedIn(),
    fetching,
    lastFetchAt: data.lastFetchAt,
    error: lastError,
  };
}

function emit(): TodosState {
  const s = getTodosState();
  onChange?.(s);
  return s;
}

/** A feed page, or nothing if this org or API version doesn't offer that feed. */
async function feedPage(feed: string): Promise<ConnectFeedElement[]> {
  try {
    const page = await sfRequest<{ elements?: ConnectFeedElement[] }>(`/chatter/feeds/${feed}/me/feed-elements?pageSize=${PAGE}`);
    return page.elements ?? [];
  } catch (err) {
    console.warn(`Chatter ${feed} feed unavailable`, err);
    return [];
  }
}

export async function refreshTodos(): Promise<TodosState> {
  await load();
  if (fetching) return getTodosState();
  if (!isSalesforceSignedIn()) return emit();
  fetching = true;
  emit();
  try {
    myId ??= (await sfRequest<{ id: string }>("/chatter/users/me")).id;
    // "To me" holds threads that mention you; the news feed also carries @mentions. Use both.
    const elements = [...(await feedPage("to")), ...(await feedPage("news"))];
    const latest = extractMentionTodos(elements, myId, salesforceInstanceUrl() ?? "");
    data.items = mergeTodos(data.items, latest, Date.now());
    const known = new Set(data.items.map((t) => t.id));
    for (const id of Object.keys(data.done)) if (!known.has(id)) delete data.done[id];
    const missing = [...new Set(data.items.map((t) => t.authorId))].filter((id) => /^005[A-Za-z0-9]{12,15}$/.test(id) && !data.people[id]);
    if (missing.length) {
      const list = missing.map((id) => `'${id}'`).join(",");
      for (const u of await soql<{ Id: string; Email?: string; MobilePhone?: string; Phone?: string }>(`SELECT Id, Email, MobilePhone, Phone FROM User WHERE Id IN (${list})`)) {
        data.people[u.Id] = { email: u.Email ?? undefined, phone: u.MobilePhone || u.Phone || undefined };
      }
    }
    data.lastFetchAt = new Date().toISOString();
    lastError = undefined;
    await save();
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  } finally {
    fetching = false;
  }
  return emit();
}

/** Check an item off (or back on). Liking is best effort and never blocks checking off. */
export async function setTodoDone(id: string, done: boolean): Promise<{ state: TodosState; warning?: string }> {
  await load();
  const item = data.items.find((t) => t.id === id);
  if (!item) return { state: getTodosState(), warning: "That item is no longer in your list." };
  if (done) data.done[id] = new Date().toISOString();
  else delete data.done[id];
  await save();
  let warning: string | undefined;
  if (done && getState().settings.salesforce.likeOnDone) {
    try {
      if (item.kind === "post") await sfRequest(`/chatter/feed-elements/${encodeURIComponent(item.feedElementId)}/capabilities/chatter-likes/items`, { method: "POST" });
      else await sfRequest(`/chatter/comments/${encodeURIComponent(item.id)}/likes`, { method: "POST" });
    } catch (err) {
      warning = `Checked off, but the like didn't go through: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return { state: emit(), warning };
}

/** Post a reply on the thread where you were mentioned. */
export async function replyToTodo(id: string, text: string): Promise<void> {
  await load();
  const item = data.items.find((t) => t.id === id);
  if (!item) throw new Error("That item is no longer in your list.");
  await sfRequest(`/chatter/feed-elements/${encodeURIComponent(item.feedElementId)}/capabilities/comments/items`, {
    method: "POST",
    body: JSON.stringify({ body: { messageSegments: [{ type: "Text", text }] } }),
  });
}

export async function initTodos(cb: (s: TodosState) => void): Promise<void> {
  onChange = cb;
  await load();
  emit();
  if (timer) clearInterval(timer);
  timer = setInterval(() => void refreshTodos(), REFRESH_MS);
  setTimeout(() => void refreshTodos(), 10_000);
}

/** Salesforce sign-in changed: refresh now (signed in) or show the sign-in prompt (signed out). */
export function salesforceChangedForTodos(): void {
  myId = undefined;
  if (loaded) void refreshTodos();
}
