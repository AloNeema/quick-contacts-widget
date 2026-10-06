import { ChevronsLeftRight, GripHorizontal } from "lucide-react";
import type { Contact } from "@shared/types";
import { preferredPhone } from "@shared/phone";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";
import { useContactsStore } from "@renderer/store/useContacts";
import { Avatar } from "./Avatar";
import { ResizeGrip } from "./ResizeGrip";

/** Slim edge-docked column of avatars. Hovering anywhere expands into the full panel. */
export function DockStrip({ contacts, photosBaseUrl, side, onUndock }: { contacts: Contact[]; photosBaseUrl: string; side: "left" | "right"; onUndock: () => void }) {
  const presence = useContactsStore((s) => s.presence);
  const talkdesk = useContactsStore((s) => s.settings.dialer.id === "talkdesk");
  const showToast = useContactsStore((s) => s.showToast);
  const call = (c: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    const run = (p: Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => p.then((r) => { if (!r.ok) showToast(r.error, "error"); else if (r.message) showToast(r.message); });
    if (e.shiftKey && c.email) return run(window.contacts.email(c.email, c.id));
    const action = e.altKey ? "sms" : "call";
    const number = preferredPhone(c, action);
    if (number) return run(window.contacts.dial({ action, phone: number.phone, contactId: c.id }));
    if (c.email) return run(window.contacts.email(c.email, c.id));
  };
  return (
    <div className="dock-strip flex h-full w-full flex-col items-center">
      <div className="drag flex w-full items-center justify-center pb-1 pt-2 text-muted-foreground/60" aria-label="Drag to move">
        <GripHorizontal className="h-4 w-4" />
      </div>
      <div className="no-drag flex min-h-0 flex-1 flex-col items-center gap-2.5 overflow-y-auto px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {contacts.map((c) => (
          <Tooltip key={c.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${talkdesk ? "Copy calling number for" : "Call"} ${c.name}`}
                onClick={(e) => void call(c, e)}
                className="shrink-0 rounded-full transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Avatar contact={c} photosBaseUrl={photosBaseUrl} size={42} presence={c.m365?.kind === "user" ? presence[c.m365.id] : undefined} />
              </button>
            </TooltipTrigger>
            <TooltipContent side={side === "right" ? "left" : "right"}>{c.name}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUndock();
        }}
        aria-label="Undock"
        className="no-drag mb-5 mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <ChevronsLeftRight className="h-3.5 w-3.5" />
      </button>
      <ResizeGrip />
    </div>
  );
}
