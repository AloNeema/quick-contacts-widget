/**
 * Chatter @mentions as a to-do list. Salesforce's Connect API returns each post and comment as
 * structured message segments; a "Mention" segment names exactly who was tagged, so a mention in a
 * post body and one in a reply are both found without guessing from the text.
 */

export interface ChatterTodo {
  /** The post's or the comment's id: one item per place you were mentioned. */
  id: string;
  kind: "post" | "comment";
  /** The thread (feed element) the mention belongs to; replies go here. */
  feedElementId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  /** The record the thread sits on (Opportunity, Account, a user profile, …). */
  parentId?: string;
  parentName?: string;
  url: string;
}

interface Segment {
  type?: string;
  text?: string;
  record?: { id?: string } | null;
  user?: { id?: string } | null;
}
interface Actor {
  id?: string;
  displayName?: string;
  name?: string;
}
interface Body {
  text?: string | null;
  messageSegments?: Segment[] | null;
}
export interface ConnectComment {
  id: string;
  body?: Body | null;
  createdDate?: string;
  user?: Actor | null;
}
export interface ConnectFeedElement {
  id: string;
  body?: Body | null;
  createdDate?: string;
  actor?: Actor | null;
  parent?: { id?: string; name?: string; displayName?: string } | null;
  capabilities?: { comments?: { page?: { items?: ConnectComment[] | null; total?: number } | null } | null } | null;
}

export function mentions(body: Body | null | undefined, userId: string): boolean {
  return Boolean(body?.messageSegments?.some((s) => s.type === "Mention" && (s.record?.id === userId || s.user?.id === userId)));
}

/** Plain text of a post or comment, trimmed and capped for the list. */
function textOf(body: Body | null | undefined): string {
  const raw = body?.text ?? body?.messageSegments?.map((s) => s.text ?? "").join("") ?? "";
  return raw.replace(/\s+\n/g, "\n").trim().slice(0, 2000);
}

/** Every place in these threads where `userId` was @mentioned by someone else, newest first. */
export function extractMentionTodos(elements: ConnectFeedElement[], userId: string, instanceUrl: string): ChatterTodo[] {
  const out = new Map<string, ChatterTodo>();
  const base = instanceUrl.replace(/\/$/, "");
  for (const el of elements) {
    const parentName = el.parent?.name ?? el.parent?.displayName;
    const url = `${base}/${el.id}`;
    if (el.actor?.id !== userId && mentions(el.body, userId)) {
      out.set(el.id, {
        id: el.id,
        kind: "post",
        feedElementId: el.id,
        authorId: el.actor?.id ?? "",
        authorName: el.actor?.displayName ?? el.actor?.name ?? "Someone",
        text: textOf(el.body),
        createdAt: el.createdDate ?? "",
        parentId: el.parent?.id,
        parentName,
        url,
      });
    }
    for (const c of el.capabilities?.comments?.page?.items ?? []) {
      if (c.user?.id === userId || !mentions(c.body, userId)) continue;
      out.set(c.id, {
        id: c.id,
        kind: "comment",
        feedElementId: el.id,
        authorId: c.user?.id ?? "",
        authorName: c.user?.displayName ?? c.user?.name ?? "Someone",
        text: textOf(c.body),
        createdAt: c.createdDate ?? "",
        parentId: el.parent?.id,
        parentName,
        url,
      });
    }
  }
  return [...out.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Keep earlier mentions that dropped out of the latest feed page (so nothing vanishes before you
 * check it off), newest first, and forget anything older than `keepDays`.
 */
export function mergeTodos(previous: ChatterTodo[], latest: ChatterTodo[], now: number, keepDays = 90): ChatterTodo[] {
  const cutoff = new Date(now - keepDays * 86_400_000).toISOString();
  const byId = new Map(previous.map((t) => [t.id, t]));
  for (const t of latest) byId.set(t.id, t);
  return [...byId.values()].filter((t) => t.createdAt >= cutoff).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
