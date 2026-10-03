import { Pin } from "lucide-react";
import type { Contact } from "@shared/types";
import { formatPhoneForDisplay } from "@shared/phone";
import { cn } from "@renderer/lib/utils";
import { Avatar } from "./Avatar";
import { useContactsStore } from "@renderer/store/useContacts";
import { QuickActions } from "./QuickActions";

export function ContactRow({ contact, photosBaseUrl, compact }: { contact: Contact; photosBaseUrl: string; compact: boolean }) {
  const presence = useContactsStore((s) => (contact.m365?.kind === "user" ? s.presence[contact.m365.id] : undefined));
  const subtitle = [contact.title, contact.company].filter(Boolean).join(" · ") || formatPhoneForDisplay(contact.phone) || contact.email || "";
  return (
    <li
      className={cn(
        "contact-row group no-drag relative flex items-center gap-3 rounded-2xl px-2.5",
        compact ? "py-1.5" : "py-2",
      )}
    >
      <Avatar contact={contact} photosBaseUrl={photosBaseUrl} size={compact ? 32 : 40} presence={presence} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={cn("truncate font-medium leading-tight", compact ? "text-[13px]" : "text-sm")}>{contact.name}</p>
          {contact.pinned ? <Pin className="h-3 w-3 shrink-0 fill-current text-primary" aria-label="Pinned" /> : null}
        </div>
        {subtitle ? <p className="truncate text-xs leading-tight text-muted-foreground">{subtitle}</p> : null}
      </div>
      {/* Actions float over the right edge on hover so names keep the full row width otherwise. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-1 right-1.5 flex translate-x-1 items-center rounded-full pl-6 opacity-0 transition-all duration-200 ease-out",
          "bg-[linear-gradient(90deg,transparent,hsl(var(--glass-bg)/0.85)_28px)] group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100",
        )}
      >
        <QuickActions contact={contact} compact={compact} />
      </div>
    </li>
  );
}
