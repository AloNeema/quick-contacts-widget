import { Pin } from "lucide-react";
import type { Contact } from "@shared/types";
import { formatPhoneForDisplay } from "@shared/phone";
import { cn } from "@renderer/lib/utils";
import { Avatar } from "./Avatar";
import { QuickActions } from "./QuickActions";

export function ContactRow({ contact, photosBaseUrl, compact }: { contact: Contact; photosBaseUrl: string; compact: boolean }) {
  const subtitle = [contact.title, contact.company].filter(Boolean).join(" · ") || formatPhoneForDisplay(contact.phone) || contact.email || "";
  return (
    <li
      className={cn(
        "group no-drag relative flex items-center gap-3 rounded-2xl px-2.5 transition-colors duration-150 hover:bg-foreground/[0.07] focus-within:bg-foreground/[0.07]",
        compact ? "py-1.5" : "py-2",
      )}
    >
      <Avatar contact={contact} photosBaseUrl={photosBaseUrl} size={compact ? 32 : 40} />
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
          "pointer-events-none absolute inset-y-1 right-1.5 flex items-center rounded-full pl-6 opacity-0 transition-opacity duration-150",
          "bg-[linear-gradient(90deg,transparent,hsl(var(--glass-bg)/0.9)_28px)] group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        )}
      >
        <QuickActions contact={contact} compact={compact} />
      </div>
    </li>
  );
}
