import { useEffect, useMemo, useState } from "react";
import { Briefcase, Inbox, Loader2, Mail, MoreHorizontal, Paperclip, Phone, RefreshCw, Reply, Search, UserCheck, UserPlus, UserX, X } from "lucide-react";
import type { ClientItem, ClientReason, Contact } from "@shared/types";
import { createContact, relativeTime } from "@shared/merge";
import { cn } from "@renderer/lib/utils";
import { useContactsStore } from "@renderer/store/useContacts";
import { Avatar } from "./Avatar";

const REASON: Record<ClientReason, { label: string; Icon: typeof Mail }> = {
  salesforce: { label: "In Salesforce", Icon: Briefcase },
  replied: { label: "Replied to you", Icon: Reply },
  attachments: { label: "Sent files", Icon: Paperclip },
  repeat: { label: "Emails often", Icon: Mail },
  conversation: { label: "Back and forth", Icon: Mail },
};

/** The Clients tab: people outside the company who emailed you, newest first. */
export function ClientsList({ photosBaseUrl, compact }: { photosBaseUrl: string; compact: boolean }) {
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? state.items.filter((i) => [i.name, i.email, i.domain, i.lastSubject].some((v) => v.toLowerCase().includes(q))) : state.items;
  }, [state.items, query]);

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
  if (!m365.signedIn) {
    return (
      <Empty
        title="Connect your inbox"
        body="Sign in to Microsoft 365 and the widget will list the clients who've emailed you, newest first."
        action={["Sign in", () => void window.contacts.openSettings("m365")]}
      />
    );
  }

  const Row = ({ i }: { i: ClientItem }) => {
    const contact = i.contactId ? byId.get(i.contactId) : undefined;
    const avatarContact: Contact = contact ?? { ...createContact({ name: i.name, email: i.email }, 0), id: `cl-${i.email}` };
    return (
      <li className={cn("contact-row group relative rounded-2xl px-2.5", compact ? "py-1.5" : "py-2", i.isNew && "client-new")}>
        <div className="flex items-start gap-3">
          <Avatar contact={avatarContact} photosBaseUrl={photosBaseUrl} size={compact ? 32 : 40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className={cn("truncate font-medium leading-tight", compact ? "text-[13px]" : "text-sm")}>{i.name}</p>
              {i.isNew ? <span className="new-chip shrink-0 rounded-full px-1.5 text-[9px] font-semibold uppercase tracking-wide">New</span> : null}
              <span className="ml-auto shrink-0 pl-2 text-[10px] tabular-nums text-muted-foreground/80">{relativeTime(i.lastInboundAt ?? i.lastActivityAt)}</span>
            </div>
            <p className="truncate text-xs leading-tight text-foreground/80">{i.lastSubject}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {i.waitingOnYou ? <span className="waiting-chip rounded-full px-1.5 py-px text-[10px] font-medium">Waiting on you</span> : null}
              {i.reasons.map((r) => {
                const { label, Icon } = REASON[r];
                return (
                  <span key={r} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.07] px-1.5 py-px text-[10px] text-muted-foreground">
                    <Icon className="h-2.5 w-2.5" /> {label}
                  </span>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            aria-label={`Remove ${i.name} from the list`}
            title="Remove from list"
            onClick={() => void mark(i, "hide")}
            className="no-drag -mr-1 mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-red-500/20 hover:text-red-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 pl-[52px]">
          <button type="button" className="fu-btn fu-btn-primary" onClick={() => void (i.webLink ? run(window.contacts.openLink(i.webLink)) : run(window.contacts.email(i.email, contact?.id)))}>
            <Reply className="h-3 w-3" /> Reply
          </button>
          {contact?.phone ? (
            <button type="button" className="fu-btn" onClick={() => void run(window.contacts.dial({ action: "call", phone: contact.phone!, contactId: contact.id }))}>
              <Phone className="h-3 w-3" /> Call
            </button>
          ) : null}
          {contact ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><UserCheck className="h-3 w-3" /> In contacts</span>
          ) : (
            <button type="button" className="fu-btn" onClick={() => keep(i)}>
              <UserPlus className="h-3 w-3" /> Keep
            </button>
          )}
          <div className="relative ml-auto">
            <button type="button" aria-label="More" className="fu-btn !px-1.5" onClick={() => setMenu(menu === i.email ? null : i.email)}>
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
                <p className="px-2.5 pb-1 pt-0.5 text-[10px] leading-snug text-muted-foreground">{i.email}</p>
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
      <p className="no-drag px-3.5 pb-1.5 text-[10px] text-muted-foreground">
        {state.scanning
          ? "Checking your inbox…"
          : state.lastScanAt
            ? `${state.items.length} clients from the last ${cfg.lookbackDays} days · checked ${relativeTime(state.lastScanAt)}${state.hiddenCount ? ` · ${state.hiddenCount} removed` : ""}`
            : "Not checked yet"}
      </p>
      {state.error ? <p className="mx-3 mb-2 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-[11px] text-red-200">{state.error}</p> : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3" onScroll={() => menu && setMenu(null)}>
        {visible.length === 0 && !state.scanning ? (
          query ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">No clients match “{query}”.</p>
          ) : (
            <Empty title="No clients yet" body="When someone outside the company emails you and looks like a client, they'll show up here." />
          )
        ) : (
          <ul className="space-y-1">
            {visible.map((i) => (
              <Row key={i.email} i={i} />
            ))}
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
