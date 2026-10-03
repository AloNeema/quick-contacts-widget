import { Pin, StickyNote } from "lucide-react";
import { relativeTime } from "@shared/merge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";
import { CopyField } from "./CopyField";
import { ContactDetails } from "./ContactDetails";
import { useRef } from "react";
import type { Contact } from "@shared/types";
import { formatPhoneForDisplay } from "@shared/phone";
import { cn } from "@renderer/lib/utils";
import { Avatar } from "./Avatar";
import { useContactsStore } from "@renderer/store/useContacts";
import { QuickActions } from "./QuickActions";

export function ContactRow({ contact, photosBaseUrl, compact, open, onToggle }: { contact: Contact; photosBaseUrl: string; compact: boolean; open: boolean; onToggle: () => void }) {
  const prefetch = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPrefetch = () => {
    if (prefetch.current) clearTimeout(prefetch.current);
    prefetch.current = setTimeout(() => void window.contacts.getContext(contact.id).catch(() => undefined), 450);
  };
  const stopPrefetch = () => prefetch.current && clearTimeout(prefetch.current);
  const presence = useContactsStore((s) => (contact.m365?.kind === "user" ? s.presence[contact.m365.id] : undefined));
  const subtitle = [contact.title, contact.company].filter(Boolean).join(" · ") || formatPhoneForDisplay(contact.phone) || contact.email || "";
  return (
    <li
      onMouseEnter={startPrefetch}
      onMouseLeave={stopPrefetch}
      className={cn("contact-row group no-drag relative rounded-2xl px-2.5", compact ? "py-1.5" : "py-2", open && "contact-row-open")}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
        className="flex cursor-default items-center gap-3 focus-visible:outline-none"
      >
      <Avatar contact={contact} photosBaseUrl={photosBaseUrl} size={compact ? 32 : 40} presence={presence} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={cn("truncate font-medium leading-tight", compact ? "text-[13px]" : "text-sm")}>{contact.name}</p>
          {contact.pinned ? <Pin className="h-3 w-3 shrink-0 fill-current text-primary" aria-label="Pinned" /> : null}
          {contact.notes ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0 text-muted-foreground/70" aria-label="Has a note"><StickyNote className="h-3 w-3" /></span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px] whitespace-pre-wrap">{contact.notes}</TooltipContent>
            </Tooltip>
          ) : null}
          {contact.lastContactedAt ? <span className="ml-auto shrink-0 pl-2 text-[10px] tabular-nums text-muted-foreground/70 group-hover:opacity-0">{relativeTime(contact.lastContactedAt)}</span> : null}
        </div>
        <div className="relative h-4 text-xs leading-tight text-muted-foreground">
          {subtitle ? <p className="absolute inset-0 truncate transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">{subtitle}</p> : null}
          <p className="absolute inset-0 flex items-center gap-2 truncate opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            {contact.phone ? <CopyField value={contact.phone} label={formatPhoneForDisplay(contact.phone)} /> : null}
            {contact.email ? <CopyField value={contact.email} label={contact.email} /> : null}
            {!contact.phone && !contact.email ? <span>No phone or email</span> : null}
          </p>
        </div>
      </div>
      </div>
      {open ? <ContactDetails contact={contact} /> : null}
      {/* Actions float over the right edge on hover so names keep the full row width otherwise. */}
      <div
        className={cn(
          "pointer-events-none absolute right-1.5 flex translate-x-1 items-center rounded-full pl-6 opacity-0 transition-all duration-200 ease-out",
          compact ? "top-1" : "top-1.5",
          "bg-[linear-gradient(90deg,transparent,hsl(var(--glass-bg)/0.85)_28px)] group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100",
        )}
      >
        <QuickActions contact={contact} compact={compact} />
      </div>
    </li>
  );
}
