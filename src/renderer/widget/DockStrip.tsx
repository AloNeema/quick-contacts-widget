import { ChevronLeft, ChevronRight, ChevronsLeftRight, GripHorizontal } from "lucide-react";
import type { Contact } from "@shared/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";
import { useContactsStore } from "@renderer/store/useContacts";
import { Avatar } from "./Avatar";
import { ResizeGrip } from "./ResizeGrip";

/** Slim edge-docked column. Expand explicitly; avatars open contact details. */
export function DockStrip({ contacts, photosBaseUrl, side, onExpand, onUndock }: { contacts: Contact[]; photosBaseUrl: string; side: "left" | "right"; onExpand: (contactId?: string) => void; onUndock: () => void }) {
  const presence = useContactsStore((s) => s.presence);
  return (
    <div className="dock-strip flex h-full w-full flex-col items-center">
      <div className="drag flex w-full items-center justify-center pb-1 pt-2 text-muted-foreground/60" aria-label="Drag to move">
        <GripHorizontal className="h-4 w-4" />
      </div>
      <button
        type="button"
        onClick={() => onExpand()}
        aria-label="Expand contacts"
        aria-expanded={false}
        title="Expand contacts"
        className="no-drag mb-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {side === "right" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      <div className="no-drag flex min-h-0 flex-1 flex-col items-center gap-2.5 overflow-y-auto px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {contacts.map((c) => (
          <Tooltip key={c.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Open ${c.name}`}
                onClick={() => onExpand(c.id)}
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
