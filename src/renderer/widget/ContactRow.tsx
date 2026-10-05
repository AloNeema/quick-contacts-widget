import { Pin, StickyNote } from "lucide-react";
import { relativeTime } from "@shared/merge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";
import { CopyField } from "./CopyField";
import { ContactDetails } from "./ContactDetails";
import { useRef } from "react";
import type { Contact } from "@shared/types";
import { formatPhoneForDisplay, preferredPhone } from "@shared/phone";
import { cn } from "@renderer/lib/utils";
import { Avatar } from "./Avatar";
import { useContactsStore } from "@renderer/store/useContacts";
import { QuickActions } from "./QuickActions";
import { ContactDragHandle, type useContactReorder } from "@renderer/hooks/useContactReorder";

export function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export function ContactRow({ contact, photosBaseUrl, compact, open, onToggle, reorder }: { contact: Contact; photosBaseUrl: string; compact: boolean; open: boolean; onToggle: () => void; reorder: ReturnType<typeof useContactReorder> }) {
  const prefetch = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPrefetch = () => {
    if (prefetch.current) clearTimeout(prefetch.current);
    prefetch.current = setTimeout(() => void window.contacts.getContext(contact.id).catch(() => undefined), 450);
  };
  const stopPrefetch = () => prefetch.current && clearTimeout(prefetch.current);
  const presence = useContactsStore((s) => (contact.m365?.kind === "user" ? s.presence[contact.m365.id] : undefined));
  const showDeals = useContactsStore((s) => s.settings.salesforce.showDeals);
  const deal = showDeals ? contact.sf?.topDeal : undefined;
  const call = preferredPhone(contact, "call");
  const subtitle = [contact.title, contact.company].filter(Boolean).join(" · ") || formatPhoneForDisplay(contact.phone || contact.mobilePhone) || contact.email || "";
  return (
    <li
      {...reorder.rowProps(contact.id)}
      onMouseEnter={startPrefetch}
      onMouseLeave={stopPrefetch}
      className={cn("contact-row group no-drag relative rounded-2xl px-2.5", compact ? "py-1.5" : "py-2", open && "contact-row-open", reorder.rowClass(contact.id))}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
        className="flex cursor-default items-center gap-2 rounded-xl"
      >
      <ContactDragHandle reorder={reorder} contact={contact} />
      <Avatar contact={contact} photosBaseUrl={photosBaseUrl} size={compact ? 32 : 40} presence={presence} />
      {/* Text column reserves room for the hover actions instead of being painted over by them. */}
      <div className="min-w-0 flex-1 transition-[padding] duration-150 group-hover:pr-[106px] group-focus-within:pr-[106px]">
        <div className="flex items-center gap-1.5">
          <p className={cn("min-w-0 truncate font-medium leading-tight", compact ? "text-[13px]" : "text-sm")}>{contact.name}</p>
          {contact.pinned ? <Pin className="h-3 w-3 shrink-0 fill-current text-primary" aria-label="Pinned" /> : null}
          {contact.notes ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0 text-muted-foreground/80" aria-label={`Note: ${contact.notes}`}><StickyNote className="h-3 w-3" /></span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px] whitespace-pre-wrap">{contact.notes}</TooltipContent>
            </Tooltip>
          ) : null}
          {contact.lastContactedAt ? (
            <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-muted-foreground group-hover:hidden group-focus-within:hidden" title={`Last contacted ${new Date(contact.lastContactedAt).toLocaleString()}`}>
              {relativeTime(contact.lastContactedAt)}
            </span>
          ) : null}
        </div>
        <div className="relative h-[18px] text-xs leading-[18px] text-muted-foreground">
          <p className="absolute inset-0 flex items-center gap-1.5 transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
            {deal ? (
              <span className="deal-pill shrink-0 rounded-full px-1.5 text-[11px] font-medium leading-[16px]" title={`${deal.name} · Salesforce`}>
                {deal.stage}{deal.amount ? ` · ${fmtMoney(deal.amount)}` : ""}
              </span>
            ) : null}
            <span className="min-w-0 truncate">{subtitle}</span>
          </p>
          <p className="absolute inset-0 flex items-center gap-2 truncate opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            {call ? <CopyField value={call.phone} label={formatPhoneForDisplay(call.phone)} /> : contact.email ? <CopyField value={contact.email} label={contact.email} /> : null}
            {!contact.phone && !contact.mobilePhone && !contact.email ? <span>No phone or email</span> : null}
          </p>
        </div>
      </div>
      </div>
      {open ? <ContactDetails contact={contact} /> : null}
      {/* Quick actions sit in space the text column gives up on hover/focus, so they never hide the name. */}
      <div
        className={cn(
          "pointer-events-none absolute right-2 flex translate-x-1 items-center opacity-0 transition-all duration-200 ease-out",
          compact ? "top-1.5" : "top-2.5",
          "group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100",
        )}
      >
        <QuickActions contact={contact} compact={compact} />
      </div>
    </li>
  );
}
