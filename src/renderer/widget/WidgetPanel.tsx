import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MoreHorizontal, Plus, PanelLeftClose, PanelRightClose, Pin, PinOff, Reply, Search, Settings2, Upload, UserPlus, X } from "lucide-react";
import { ClientsList, type ClientFilter } from "./ClientsList";
import { SortMenu } from "./SortMenu";
import { QuickAdd } from "./QuickAdd";
import { filterContacts, groupsOf, recentContacts } from "@shared/merge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";
import { cn } from "@renderer/lib/utils";
import { useContactsStore } from "@renderer/store/useContacts";
import { ContactRow } from "./ContactRow";
import { RecentsStrip } from "./RecentsStrip";
import { DockStrip } from "./DockStrip";
import { ResizeEdge, ResizeGrip } from "./ResizeGrip";
import { useContactReorder } from "@renderer/hooks/useContactReorder";
import { preferredPhone } from "@shared/phone";

function HeaderButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "header-btn no-drag inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
            active && "text-primary",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function WidgetPanel() {
  const contacts = useContactsStore((s) => s.contacts);
  const settings = useContactsStore((s) => s.settings);
  const photosBaseUrl = useContactsStore((s) => s.photosBaseUrl);
  const toast = useContactsStore((s) => s.toast);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | undefined>(undefined);
  const updateSettings = useContactsStore((s) => s.updateSettings);
  const dock = settings.dock;
  const [dockExpanded, setDockExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"contacts" | "clients">("contacts");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");
  const clients = useContactsStore((s) => s.clients);
  const m365SignedIn = useContactsStore((s) => s.m365.signedIn);
  const waitingCount = clients.items.filter((i) => i.waitingOnYou).length;
  useEffect(() => window.contacts.onShowTab((t) => {
    setTab(t);
    if (dock.enabled) {
      setDockExpanded(true);
      void window.contacts.dockExpand(true);
    }
  }), [dock.enabled]);
  // Narrow widget: fold the secondary header toggles into a menu so the tabs never collide with them.
  // Both tabs plus the Clients badge and four header buttons need ~370px, so the default 340px
  // window uses the compact header.
  const NARROW_HEADER_PX = 380;
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_HEADER_PX);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < NARROW_HEADER_PX);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const quickAddRef = useRef<HTMLButtonElement>(null);
  const closeQuickAdd = useCallback(() => {
    setQuickAdd(false);
    requestAnimationFrame(() => quickAddRef.current?.focus());
  }, []);
  const openWaiting = () => {
    setClientFilter("waiting");
    setTab("clients");
  };
  const expandDock = (contactId?: string) => {
    if (contactId) {
      setTab("contacts");
      setOpenId(contactId);
    }
    if (!dock.enabled || dockExpanded) return;
    setDockExpanded(true);
    void window.contacts.dockExpand(true);
  };
  const collapseDock = () => {
    setMoreOpen(false);
    setDockExpanded(false);
    void window.contacts.dockExpand(false);
  };
  useEffect(() => {
    if (!dock.enabled) setDockExpanded(false);
  }, [dock.enabled]);
  const toggleDock = () => {
    setDockExpanded(false);
    void updateSettings({ dock: { ...dock, enabled: !dock.enabled } });
  };
  const searchRef = useRef<HTMLInputElement>(null);
  const showToast = useContactsStore((s) => s.showToast);

  useEffect(
    () =>
      window.contacts.onFocusSearch(() => {
        setTab("contacts");
        setQuery("");
        if (dock.enabled) {
          setDockExpanded(true);
          void window.contacts.dockExpand(true);
        }
        requestAnimationFrame(() => searchRef.current?.focus());
      }),
    [dock.enabled],
  );
  const compact = settings.appearance.density === "compact";
  const acrylic = settings.appearance.acrylic && ["win32", "darwin"].includes(useContactsStore.getState().platform);

  const groups = useMemo(() => groupsOf(contacts), [contacts]);
  const activeGroup = group && groups.includes(group) ? group : undefined;
  const visible = useMemo(() => filterContacts(contacts, query, activeGroup, settings.sort), [contacts, query, activeGroup, settings.sort]);
  const reorder = useContactReorder(visible, settings.sort);
  const pinnedCount = visible.filter((c) => c.pinned).length;
  const showPinnedDivider = pinnedCount > 0 && !query;
  const recents = useMemo(() => recentContacts(contacts, 6), [contacts]);

  if (dock.enabled && !dockExpanded) {
    return (
      <div className="h-full w-full">
        <DockStrip contacts={visible} photosBaseUrl={photosBaseUrl} side={dock.side} onExpand={expandDock} onUndock={toggleDock} />
      </div>
    );
  }

  return (
    <div className={cn("h-full w-full", acrylic || dock.enabled ? "p-0" : "p-2")}>
      <div className="glass-panel flex h-full w-full flex-col">
        {/* Header: the only drag region */}
        <header className={cn("relative z-10 flex items-center gap-2 px-3.5 pb-1.5 pt-3.5", dock.enabled ? "no-drag" : "drag")}>
          <div className="flex min-w-0 flex-1 items-center gap-1" role="tablist">
            <span className="status-dot mr-1 h-2 w-2 shrink-0 rounded-full" aria-hidden />
            <button
              type="button"
              role="tab"
              aria-selected={tab === "contacts"}
              onClick={() => setTab("contacts")}
              className={cn("no-drag title-display flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 text-[14px] transition-colors", tab === "contacts" ? "text-foreground/95" : "text-muted-foreground hover:text-foreground")}
            >
              Contacts {narrow ? null : <span className="text-[11px] tabular-nums text-muted-foreground">{contacts.length}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "clients"}
              aria-label={clients.newCount ? `Clients, ${clients.newCount} new since you last looked` : "Clients"}
              onClick={() => setTab("clients")}
              className={cn("no-drag title-display flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 text-[14px] transition-colors", tab === "clients" ? "text-foreground/95" : "text-muted-foreground hover:text-foreground")}
            >
              Clients
              {clients.newCount > 0 ? (
                <span className="due-badge min-w-[18px] rounded-full px-1.5 text-center text-[11px] font-semibold leading-[18px] text-white" aria-hidden>
                  {clients.newCount}
                </span>
              ) : null}
            </button>
          </div>
          {narrow ? (
            <div className="relative">
              <HeaderButton label="More window options" active={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </HeaderButton>
              {moreOpen ? (
                <div role="menu" className="menu-glass no-drag absolute right-0 top-8 z-40 w-44 rounded-xl p-1 animate-fade-up" onMouseLeave={() => setMoreOpen(false)}>
                  <button type="button" role="menuitem" className="menu-item" onClick={() => (setMoreOpen(false), void window.contacts.toggleAlwaysOnTop())}>
                    {settings.alwaysOnTop ? <Pin className="h-3.5 w-3.5 fill-current" /> : <PinOff className="h-3.5 w-3.5" />} {settings.alwaysOnTop ? "Unpin from top" : "Keep on top"}
                  </button>
                  <button type="button" role="menuitem" className="menu-item" onClick={() => (setMoreOpen(false), toggleDock())}>
                    {dock.side === "right" ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />} {dock.enabled ? "Undock" : `Dock to ${dock.side} edge`}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <HeaderButton label={settings.alwaysOnTop ? "Unpin from top" : "Keep on top"} active={settings.alwaysOnTop} onClick={() => void window.contacts.toggleAlwaysOnTop()}>
                {settings.alwaysOnTop ? <Pin className="h-3.5 w-3.5 fill-current" /> : <PinOff className="h-3.5 w-3.5" />}
              </HeaderButton>
              <HeaderButton label={dock.enabled ? "Undock" : `Dock to ${dock.side} edge`} active={dock.enabled} onClick={toggleDock}>
                {dock.side === "right" ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
              </HeaderButton>
            </>
          )}
          <HeaderButton label="Settings" onClick={() => void window.contacts.openSettings()}>
            <Settings2 className="h-3.5 w-3.5" />
          </HeaderButton>
          <HeaderButton label={dock.enabled ? "Collapse to contact bar" : "Hide (reopen from the tray)"} onClick={dock.enabled ? collapseDock : () => void window.contacts.hideWidget()}>
            <X className="h-3.5 w-3.5" />
          </HeaderButton>
        </header>

        {tab === "clients" ? (
          <ClientsList photosBaseUrl={photosBaseUrl} compact={compact} filter={clientFilter} onFilterChange={setClientFilter} />
        ) : (
        <>
        {/* Search */}
        <div className="relative z-30 flex items-center gap-1.5 px-3 pb-2">
          <div className="no-drag glass-inset relative min-w-0 flex-1 rounded-xl">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (query) setQuery("");
                  else void window.contacts.hideWidget();
                } else if (e.key === "Enter" && query && visible[0]) {
                  const c = visible[0];
                  const action = e.altKey ? "sms" : "call";
                  const number = preferredPhone(c, action);
                  if (e.shiftKey && c.email) void window.contacts.email(c.email, c.id).then((r) => !r.ok && showToast(r.error, "error"));
                  else if (number) void window.contacts.dial({ action, phone: number.phone, contactId: c.id }).then((r) => { if (!r.ok) showToast(r.error, "error"); else if (r.message) showToast(r.message); });
                  else if (c.email) void window.contacts.email(c.email, c.id).then((r) => !r.ok && showToast(r.error, "error"));
                }
              }}
              placeholder="Search name, company, number…"
              className="h-8 w-full rounded-xl bg-transparent pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
            />
          </div>
          <SortMenu value={settings.sort} onChange={(sort) => void updateSettings({ sort })} />
          <button
            ref={quickAddRef}
            type="button"
            aria-label="Add a contact from an email signature"
            title="Add a contact from an email signature"
            onClick={() => setQuickAdd(true)}
            className="no-drag glass-inset inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Answer "who's waiting on me?" from the first screen, and jump straight to those records. */}
        {m365SignedIn && waitingCount > 0 && !query ? (
          <div className="relative z-10 px-3 pb-2">
            <button type="button" onClick={openWaiting} className="waiting-banner no-drag flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left">
              <Reply className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {waitingCount} {waitingCount === 1 ? "client is" : "clients are"} waiting on your reply
              </span>
              <span className="flex shrink-0 items-center text-[12px] font-medium opacity-90">
                Review <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>
          </div>
        ) : null}
        {groups.length > 0 ? (
          <div className="no-drag relative z-10 flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[undefined, ...groups].map((g) => (
              <button
                key={g ?? "__all"}
                type="button"
                onClick={() => setGroup(g)}
                className={cn(
                  "chip inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[11px] font-medium transition-colors",
                  activeGroup === g ? "chip-active" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {g ?? "All"}
              </button>
            ))}
          </div>
        ) : null}
        {recents.length > 0 && !query && !activeGroup ? <RecentsStrip contacts={recents} photosBaseUrl={photosBaseUrl} /> : null}

        {/* List */}
        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
          {contacts.length === 0 ? (
            <EmptyState />
          ) : visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">{query ? <>No matches for “{query}”.</> : <>Nobody in {activeGroup}.</>}</p>
          ) : (
            <ul>
              {visible.map((c, i) => (
                <Fragment key={c.id}>
                  {i === pinnedCount && showPinnedDivider ? (
                    <li className="mx-2.5 my-1.5 h-px bg-foreground/10" role="separator" />
                  ) : null}
                  {/* ContactRow renders its own <li>. */}
                  <ContactRow contact={c} photosBaseUrl={photosBaseUrl} compact={compact} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} reorder={reorder} />
                </Fragment>
              ))}
            </ul>
          )}
        </div>
        </>
        )}

        {toast ? (
          <div
            role="status"
            className={cn(
              "toast-glass no-drag absolute inset-x-3 bottom-3 z-20 rounded-xl border px-3 py-2 text-xs animate-fade-up",
              toast.tone === "error" ? "border-destructive/40 bg-destructive/85 text-destructive-foreground" : "border-white/10 bg-card/70 text-foreground",
            )}
          >
            {toast.message}
          </div>
        ) : null}

        {quickAdd ? <QuickAdd onClose={closeQuickAdd} /> : null}

        {/* Resize from the inner edge: docked to the right, the panel grows leftwards. */}
        <ResizeEdge side={dock.enabled && dock.side === "right" ? "left" : "right"} />
        <ResizeGrip side={dock.enabled && dock.side === "right" ? "left" : "right"} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="no-drag flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <UserPlus className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium">No contacts yet</p>
      <p className="text-xs text-muted-foreground">Import an Excel or CSV list, or add people one at a time in Settings.</p>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={() => void window.contacts.openSettings("import")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Upload className="h-3.5 w-3.5" /> Import spreadsheet
        </button>
        <button
          type="button"
          onClick={() => void window.contacts.openSettings("contacts")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium hover:bg-foreground/10"
        >
          Add manually
        </button>
      </div>
    </div>
  );
}
