import { useMemo, useState } from "react";
import { AtSign, Check, ChevronDown, ExternalLink, Loader2, Mail, Phone, RefreshCw, Reply, Send } from "lucide-react";
import type { TodoItem } from "@shared/types";
import { relativeTime } from "@shared/merge";
import { normalizeUsPhone } from "@shared/phone";
import { cn } from "@renderer/lib/utils";
import { useContactsStore } from "@renderer/store/useContacts";

const DONE_SHOWN = 20;

/** To-do tab: every Chatter post or reply where someone @mentioned you, until you check it off. */
export function TodoList({ compact }: { compact: boolean }) {
  const state = useContactsStore((s) => s.todos);
  const sf = useContactsStore((s) => s.sf);
  const showToast = useContactsStore((s) => s.showToast);
  const [showDone, setShowDone] = useState(false);
  const [replying, setReplying] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const open = useMemo(() => state.items.filter((i) => !i.doneAt), [state.items]);
  const done = useMemo(() => state.items.filter((i) => i.doneAt).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")), [state.items]);

  const toggle = async (item: TodoItem) => {
    const r = await window.contacts.setTodoDone(item.id, !item.doneAt);
    useContactsStore.setState({ todos: r.state });
    if (r.warning) showToast(r.warning, "error");
  };
  const send = async (item: TodoItem) => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const r = await window.contacts.replyToTodo(item.id, draft.trim());
      if (!r.ok) {
        showToast(r.error, "error");
        return;
      }
      showToast(`Replied to ${item.authorName.split(" ")[0]} in Chatter`);
      setReplying(null);
      setDraft("");
    } finally {
      setSending(false);
    }
  };
  const run = (p: Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    void p.then((r) => (!r.ok ? showToast(r.error, "error") : r.message ? showToast(r.message) : undefined));

  if (!sf.signedIn && state.items.length === 0) {
    return (
      <Empty
        title="Connect Salesforce"
        body="Sign in to Salesforce and every Chatter post where someone @mentions you shows up here as a to-do."
        action={["Open Salesforce settings", () => void window.contacts.openSettings("salesforce")]}
      />
    );
  }

  const row = (item: TodoItem) => {
    const isDone = Boolean(item.doneAt);
    const phone = item.authorPhone ? normalizeUsPhone(item.authorPhone) : "";
    const isExpanded = expanded === item.id;
    return (
      <li key={item.id} className={cn("contact-row group relative rounded-2xl px-2.5", compact ? "py-1.5" : "py-2")}>
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={isDone}
            aria-label={isDone ? `Mark "${item.text.slice(0, 40)}" not done` : `Check off "${item.text.slice(0, 40)}"`}
            title={isDone ? "Not done after all" : "Check off"}
            onClick={() => void toggle(item)}
            className={cn(
              "no-drag mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
              isDone ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30 hover:border-primary hover:bg-primary/15",
            )}
          >
            {isDone ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <p className={cn("min-w-0 truncate text-[13px] font-medium", isDone && "text-muted-foreground")}>{item.authorName}</p>
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground" title={item.createdAt ? new Date(item.createdAt).toLocaleString() : undefined}>
                {relativeTime(item.createdAt).replace(" ago", "")}
              </span>
            </div>
            {item.parentName ? <p className="truncate text-[11px] text-muted-foreground">on {item.parentName}</p> : null}
            <button
              type="button"
              onClick={() => setExpanded(isExpanded ? null : item.id)}
              title={isExpanded ? "Show less" : "Show the whole message"}
              className={cn(
                "no-drag mt-1 block w-full whitespace-pre-wrap break-words text-left text-xs leading-relaxed [overflow-wrap:anywhere]",
                isDone ? "text-muted-foreground line-through" : "text-foreground/90",
                !isExpanded && "line-clamp-3",
              )}
            >
              {item.text || "(no text)"}
            </button>
            {!isDone ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <button type="button" className="fu-btn fu-btn-primary" onClick={() => { setReplying(replying === item.id ? null : item.id); setDraft(""); }}>
                  <Reply className="h-3 w-3" /> Reply
                </button>
                <button type="button" className="fu-btn" title="Open this post in Salesforce" onClick={() => run(window.contacts.openLink(item.url))}>
                  <ExternalLink className="h-3 w-3" /> Open
                </button>
                {phone ? (
                  <button type="button" className="fu-btn" title={`Call ${item.authorName}`} onClick={() => run(window.contacts.dial({ action: "call", phone }))}>
                    <Phone className="h-3 w-3" /> Call
                  </button>
                ) : null}
                {item.authorEmail ? (
                  <button type="button" className="fu-btn" title={`Email ${item.authorName}`} onClick={() => run(window.contacts.email(item.authorEmail!))}>
                    <Mail className="h-3 w-3" /> Email
                  </button>
                ) : null}
              </div>
            ) : null}
            {replying === item.id ? (
              <div className="mt-2 space-y-1.5">
                <textarea
                  autoFocus
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send(item);
                    if (e.key === "Escape") setReplying(null);
                  }}
                  placeholder={`Reply to ${item.authorName.split(" ")[0]} in Chatter…`}
                  aria-label={`Reply to ${item.authorName}`}
                  className="glass-inset no-drag w-full resize-y rounded-xl bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                />
                <div className="flex items-center gap-1.5">
                  <button type="button" className="fu-btn fu-btn-primary" disabled={!draft.trim() || sending} onClick={() => void send(item)}>
                    {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send
                  </button>
                  <button type="button" className="fu-btn" onClick={() => setReplying(null)}>
                    Cancel
                  </button>
                  <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+Enter sends</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      <div className="no-drag flex items-center gap-2 px-3.5 pb-1.5">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" aria-live="polite">
          {state.fetching
            ? "Checking Chatter…"
            : state.lastFetchAt
              ? `Chatter @mentions · checked ${relativeTime(state.lastFetchAt)}`
              : "Not checked yet"}
        </p>
        <button
          type="button"
          aria-label="Check Chatter now"
          title="Check Chatter now"
          disabled={state.fetching}
          onClick={() => void window.contacts.refreshTodos().then((todos) => useContactsStore.setState({ todos }))}
          className="no-drag glass-inset inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
        >
          {state.fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {!sf.signedIn ? (
        <div role="alert" className="alert-error mx-3 mb-2 flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[12px]">
          <span className="min-w-0 flex-1">Salesforce needs you to sign in again. The list below is from the last check.</span>
          <button type="button" className="shrink-0 font-medium underline underline-offset-2" onClick={() => void window.contacts.openSettings("salesforce")}>
            Sign in
          </button>
        </div>
      ) : state.error ? (
        <div role="alert" className="alert-error mx-3 mb-2 rounded-lg px-2.5 py-1.5 text-[12px]" title={state.error}>
          Couldn't check Chatter just now. The list below is from the last successful check.
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {open.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">All caught up</p>
            <p className="mt-1">When someone @mentions you in Chatter, it shows up here until you check it off.</p>
          </div>
        ) : (
          <ul className="space-y-1">{open.map(row)}</ul>
        )}
        {done.length ? (
          <div className="mt-2">
            <button
              type="button"
              aria-expanded={showDone}
              onClick={() => setShowDone((v) => !v)}
              className="no-drag flex w-full items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", !showDone && "-rotate-90")} /> Done ({done.length})
            </button>
            {showDone ? <ul className="space-y-1">{done.slice(0, DONE_SHOWN).map(row)}</ul> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action: [string, () => void] }) {
  return (
    <div className="no-drag flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-6 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <AtSign className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
      <button type="button" onClick={action[1]} className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90">
        {action[0]}
      </button>
    </div>
  );
}
