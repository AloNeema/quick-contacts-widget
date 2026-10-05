import { useEffect, useMemo, useState } from "react";
import { Briefcase, Inbox, Loader2, Mail, MoreHorizontal, Paperclip, Phone, RefreshCw, Reply, Search, UserCheck, UserPlus, UserX, X } from "lucide-react";
import type { ClientItem, ClientReason, Contact } from "@shared/types";
import { createContact, relativeTime } from "@shared/merge";
import { preferredPhone } from "@shared/phone";
import { cn } from "@renderer/lib/utils";
import { useContactsStore } from "@renderer/store/useContacts";
import { Avatar } from "./Avatar";

export type ClientFilter = "all" | "waiting" | "new";

/** Plain-language version of a scan error, with the technical detail kept for the tooltip. */
function friendlyError(raw: string): string {
  if (/sign in/i.test(raw)) return raw;
  if (/\b(401|403)\b|expired|consent/i.test(raw)) return "Microsoft 365 needs you to sign in again before the list can refresh.";
  if (/\b5\d\d\b|fetch failed|network|ENOTFOUND|ETIMEDOUT|timed out/i.test(raw)) return "Couldn't reach Outlook just now. The list below is from the last successful check.";
  return "The last inbox check didn't finish. The list below is from the last successful check.";
}

const REASON: Record<ClientReason, { label: string; Icon: typeof Mail }> = {
  salesforce: { label: "In Salesforce", Icon: Briefcase },
  replied: { label: "Replied to you", Icon: Reply },
  attachments: { label: "Sent files", Icon: Paperclip },
  repeat: { label: "Emails often", Icon: Mail },
  conversation: { label: "Back and forth", Icon: Mail },
};

/** The Clients tab: people outside the company who emailed you, newest first. */
export function ClientsList({ photosBaseUrl, compact, filter, onFilterChange }: { photosBaseUrl: string; compact: boolean; filter: ClientFilter; onFilterChange: (f: ClientFilter) => void }) {
  const state = useContactsStore((s) => s.clients);
  const contacts = useContactsStore((s) => s.contacts);
  const m365 = useContactsStore((s) => s.m365);
  const cfg = useContactsStore((s) => s.settings.clients);
  const showToast = useContactsStore((s) => s.showToast);
  const [menu, setMenu] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  // Opening the tab clears the "new" badge after a moment, so the New chips are still visible on arrival.
  useEffect(() => {
    if (!state.newCount) return;
    const t = setTimeout(() => void window.contacts.markClientsViewed(), 4000);
    return () => clearTimeout(t);
  }, [state.newCount]);

  const counts = useMemo(
    () => ({ all: state.items.length, waiting: state.items.filter((i) => i.waitingOnYou).length, new: state.items.filter((i) => i.isNew).length }),
    [state.items],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped = filter === "waiting" ? state.items.filter((i) => i.waitingOnYou) : filter === "new" ? state.items.filter((i) => i.isNew) : state.items;
    return q ? scoped.filter((i) => [i.name, i.email, i.domain, i.lastSubject].some((v) => v.toLowerCase().includes(q))) : scoped;
  }, [state.items, query, filter]);
  const filterLabel = filter === "waiting" ? "waiting on you" : filter === "new" ? "new" : "";

  const run = async (p: Promise<{ ok: true } | { ok: false; error: string }>) => {
    const r = await p;
    if (!r.ok) showToast(r.error, "error");
  };
  const mark = async (i: ClientItem, action: "hide" | "notClient") => {
    setMenu(null);
    useContactsStore.setState({ clients: await window.contacts.markClient(i.email, action) });
    showToast(action === "hide" ? `Removed ${i.name.split(" ")[0]}. They'll come back if they email again.` : `${i.name} won't show up again.`);
  };
  const keep = (i: ClientItem) => {
    setMenu(null);
    void window.contacts.addClientContact(i.email).then((list) => {
      useContactsStore.getState().setContacts(list);
      showToast(`Added ${i.name} to your contacts`);
    });
  };

  if (!cfg.enabled) {
    return <Empty title="Clients list is off" body="Turn it on in Settings › Microsoft 365." action={["Open settings", () => void window.contacts.openSettings("m365")]} />;
  }
  // Signed out with nothing cached: invite sign-in. With a cached list, keep showing it (with a banner below).
  if (!m365.signedIn && state.items.length === 0) {
    return (
      <Empty
        title="Connect your inbox"
        body="Sign in to Microsoft 365 and the widget will list the clients who've emailed you, newest first."
        action={["Sign in", () => void window.contacts.openSettings("m365")]}
      />
    );
  }

  // A render function, not a component: a component defined here is a new type every render, so rows would remount and drop focus.
  const renderRow = (i: ClientItem) => {
    const contact = i.contactId ? byId.get(i.contactId) : undefined;
    const call = contact && preferredPhone(contact, "call");
    const avatarContact: Contact = contact ?? { ...createContact({ name: i.name, email: i.email }, 0), id: `cl-${i.email}` };
    const [top, ...rest] = i.reasons;
    const why = i.reasons.map((r) => REASON[r].label).join(", ");
    return (
      <li key={i.email} className={cn("contact-row group relative rounded-2xl px-2.5", compact ? "py-1.5" : "py-2", i.isNew && "client-new")}>
        <div className="flex items-start gap-3">
          <Avatar contact={avatarContact} photosBaseUrl={photosBaseUrl} size={compact ? 32 : 36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className={cn("min-w-0 truncate font-medium leading-tight", compact ? "text-[13px]" : "text-sm")}>{i.name}</p>
              {i.isNew ? <span className="new-chip shrink-0 rounded-full px-1.5 text-[11px] font-semibold uppercase tracking-wide">New</span> : null}
              <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-muted-foreground" title={i.lastInboundAt ? `Last email from them ${new Date(i.lastInboundAt).toLocaleString()}` : undefined}>
                {relativeTime(i.lastInboundAt ?? i.lastActivityAt).replace(" ago", "")}
              </span>
            </div>
            <p className="truncate text-xs leading-snug text-foreground/80">{i.lastSubject}</p>
            {/* One line of status: the action signal first, then the strongest reason; the rest in the tooltip. */}
            <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap" title={`Why this is a client: ${why}`} aria-label={`${i.waitingOnYou ? "Waiting on you. " : ""}Why this is a client: ${why}`}>
              {i.waitingOnYou ? <span className="waiting-chip shrink-0 rounded-full px-1.5 text-[11px] font-medium leading-[18px]">Waiting on you</span> : null}
              {top ? (
                <span className="inline-flex min-w-0 shrink items-center gap-1 truncate rounded-full bg-foreground/[0.07] px-1.5 text-[11px] leading-[18px] text-muted-foreground">
                  {(() => {
                    const { Icon, label } = REASON[top];
                    return (
                      <>
                        <Icon className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{label}</span>
                      </>
                    );
                  })()}
                </span>
              ) : null}
              {rest.length ? <span className="shrink-0 text-[11px] text-muted-foreground">+{rest.length}</span> : null}
            </div>
          </div>
          <button
            type="button"
            aria-label={`Remove ${i.name} from the list`}
            title="Remove from list (they come back if they email again)"
            onClick={() => void mark(i, "hide")}
            className="no-drag -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/20 hover:text-red-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={cn("mt-1.5 flex items-center gap-1.5", compact ? "pl-[44px]" : "pl-[48px]")}>
          <button type="button" className="fu-btn fu-btn-primary" onClick={() => void (i.webLink ? run(window.contacts.openLink(i.webLink)) : run(window.contacts.email(i.email, contact?.id)))}>
            <Reply className="h-3 w-3" /> Reply
          </button>
          {call && contact ? (
            <button type="button" className="fu-btn" onClick={() => void run(window.contacts.dial({ action: "call", phone: call.phone, contactId: contact.id }))}>
              <Phone className="h-3 w-3" /> Call
            </button>
          ) : null}
          {contact ? (
            <span className="inline-flex items-center text-muted-foreground" title="In your contacts" aria-label="In your contacts">
              <UserCheck className="h-3.5 w-3.5" aria-hidden />
            </span>
          ) : (
            <button type="button" className="fu-btn" onClick={() => keep(i)} title="Add to your contacts">
              <UserPlus className="h-3 w-3" /> Keep
            </button>
          )}
          <div className="relative ml-auto">
            <button type="button" aria-label={`More options for ${i.name}`} className="fu-btn !px-1.5" onClick={() => setMenu(menu === i.email ? null : i.email)}>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menu === i.email ? (
              <div className="menu-glass absolute right-0 top-7 z-30 w-52 rounded-xl p-1 animate-fade-up">
                <button type="button" className="menu-item" onClick={() => void mark(i, "hide")}>
                  <X className="h-3.5 w-3.5" /> Remove for now
                </button>
                <button type="button" className="menu-item text-red-300" onClick={() => void mark(i, "notClient")}>
                  <UserX className="h-3.5 w-3.5" /> Not a client, never show
                </button>
                <p className="px-2.5 pb-1 pt-0.5 text-[11px] leading-snug text-muted-foreground">{i.email}</p>
              </div>
            ) : null}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-3 pb-2">
        <div className="no-drag glass-inset relative min-w-0 flex-1 rounded-xl">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search clients, companies, subjects…"
            className="h-8 w-full rounded-xl bg-transparent pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
          />
        </div>
        <button
          type="button"
          aria-label="Check inbox now"
          title="Check inbox now"
          disabled={state.scanning}
          onClick={() => void window.contacts.scanClients().then((s) => useContactsStore.setState({ clients: s }))}
          className="no-drag glass-inset inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
        >
          {state.scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="no-drag flex gap-1.5 overflow-x-auto px-3 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Show">
        {(
          [
            ["all", "All"],
            ["waiting", "Waiting on you"],
            ["new", "New"],
          ] as const
        ).map(([f, label]) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => onFilterChange(f)}
            className={cn("chip inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors", filter === f ? "chip-active" : "text-muted-foreground hover:text-foreground")}
          >
            {label} <span className="tabular-nums opacity-80">{counts[f]}</span>
          </button>
        ))}
      </div>
      <p className="no-drag px-3.5 pb-1.5 text-[11px] text-muted-foreground" aria-live="polite">
        {state.scanning
          ? "Checking your inbox…"
          : state.lastScanAt
            ? `Last ${cfg.lookbackDays} days of email · checked ${relativeTime(state.lastScanAt)}${state.hiddenCount ? ` · ${state.hiddenCount} removed` : ""}`
            : "Not checked yet"}
      </p>
      {!m365.signedIn ? (
        <div role="alert" className="mx-3 mb-2 flex items-start gap-2 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-[12px] text-red-100">
          <span className="min-w-0 flex-1">Microsoft 365 needs you to sign in again. The list below is from the last successful check.</span>
          <button type="button" className="shrink-0 font-medium underline underline-offset-2" onClick={() => void window.contacts.openSettings("m365")}>
            Sign in
          </button>
        </div>
      ) : state.error ? (
        <div role="alert" className="mx-3 mb-2 flex items-start gap-2 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-[12px] text-red-100" title={state.error}>
          <span className="min-w-0 flex-1">{friendlyError(state.error)}</span>
          <button
            type="button"
            className="shrink-0 font-medium underline underline-offset-2"
            onClick={() => void (/sign in again/.test(friendlyError(state.error!)) ? window.contacts.openSettings("m365") : window.contacts.scanClients())}
          >
            {/sign in again/.test(friendlyError(state.error)) ? "Sign in" : "Try again"}
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3" onScroll={() => menu && setMenu(null)}>
        {visible.length === 0 && !state.scanning ? (
          query || filter !== "all" ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              <p>{query ? <>No {filterLabel} clients match “{query}”.</> : filter === "waiting" ? "Nobody is waiting on you. Nice." : "No new clients since you last looked."}</p>
              <button type="button" className="mt-2 font-medium text-foreground underline underline-offset-2" onClick={() => (setQuery(""), onFilterChange("all"))}>
                Show all clients
              </button>
            </div>
          ) : (
            <Empty title="No clients yet" body="When someone outside the company emails you and looks like a client, they'll show up here." />
          )
        ) : (
          <ul className="space-y-1">
            {visible.map((i) => renderRow(i))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: [string, () => void] }) {
  return (
    <div className="no-drag flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-6 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Inbox className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
      {action ? (
        <button type="button" onClick={action[1]} className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90">
          {action[0]}
        </button>
      ) : null}
    </div>
  );
}
