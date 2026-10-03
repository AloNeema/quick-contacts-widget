import { useEffect, useMemo, useRef, useState } from "react";
import { Pin, PinOff, Search, Settings2, Upload, UserPlus, X } from "lucide-react";
import { filterContacts } from "@shared/merge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";
import { cn } from "@renderer/lib/utils";
import { useContactsStore } from "@renderer/store/useContacts";
import { ContactRow } from "./ContactRow";
import { ResizeGrip } from "./ResizeGrip";

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
  const searchRef = useRef<HTMLInputElement>(null);
  const showToast = useContactsStore((s) => s.showToast);

  useEffect(
    () =>
      window.contacts.onFocusSearch(() => {
        setQuery("");
        requestAnimationFrame(() => searchRef.current?.focus());
      }),
    [],
  );
  const compact = settings.appearance.density === "compact";
  const acrylic = settings.appearance.acrylic && useContactsStore.getState().platform === "win32";

  const visible = useMemo(() => filterContacts(contacts, query), [contacts, query]);
  const pinnedCount = visible.filter((c) => c.pinned).length;

  return (
    <div className={cn("h-full w-full", acrylic ? "p-0" : "p-2")}>
      <div className="glass-panel flex h-full w-full flex-col">
        {/* Header: the only drag region */}
        <header className="drag relative z-10 flex items-center gap-2 px-3.5 pb-1.5 pt-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="status-dot h-2 w-2 shrink-0 rounded-full" aria-hidden />
            <h1 className="title-display truncate text-[14px] text-foreground/95">Contacts</h1>
            <span className="text-[11px] tabular-nums text-muted-foreground">{contacts.length}</span>
          </div>
          <HeaderButton label={settings.alwaysOnTop ? "Unpin from top" : "Keep on top"} active={settings.alwaysOnTop} onClick={() => void window.contacts.toggleAlwaysOnTop()}>
            {settings.alwaysOnTop ? <Pin className="h-3.5 w-3.5 fill-current" /> : <PinOff className="h-3.5 w-3.5" />}
          </HeaderButton>
          <HeaderButton label="Settings" onClick={() => void window.contacts.openSettings()}>
            <Settings2 className="h-3.5 w-3.5" />
          </HeaderButton>
          <HeaderButton label="Hide (reopen from the tray)" onClick={() => void window.contacts.hideWidget()}>
            <X className="h-3.5 w-3.5" />
          </HeaderButton>
        </header>

        {/* Search */}
        <div className="relative z-10 px-3 pb-2">
          <div className="no-drag glass-inset relative rounded-xl">
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
                  if (e.shiftKey && c.email) void window.contacts.email(c.email).then((r) => !r.ok && showToast(r.error, "error"));
                  else if (c.phone) void window.contacts.dial({ action: e.altKey ? "sms" : "call", phone: c.phone }).then((r) => !r.ok && showToast(r.error, "error"));
                  else if (c.email) void window.contacts.email(c.email).then((r) => !r.ok && showToast(r.error, "error"));
                }
              }}
              placeholder="Search name, company, number…"
              className="h-8 w-full rounded-xl bg-transparent pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
          {contacts.length === 0 ? (
            <EmptyState />
          ) : visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">No matches for “{query}”.</p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((c, i) => (
                <li key={c.id} className="contents">
                  {i === pinnedCount && pinnedCount > 0 && !query ? (
                    <div className="mx-2.5 my-1.5 h-px bg-foreground/10" role="separator" />
                  ) : null}
                  <ContactRow contact={c} photosBaseUrl={photosBaseUrl} compact={compact} />
                </li>
              ))}
            </ul>
          )}
        </div>

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

        <ResizeGrip />
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
