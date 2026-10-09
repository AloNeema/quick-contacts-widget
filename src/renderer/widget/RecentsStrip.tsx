import { Clock } from "lucide-react";
import { callCopiesNumber } from "@shared/dialer";
import type { Contact } from "@shared/types";
import { preferredPhone } from "@shared/phone";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";
import { useContactsStore } from "@renderer/store/useContacts";
import { Avatar } from "./Avatar";

/** The people you actually contact, newest first. Click to call, Alt-click to text, Shift-click to email. */
export function RecentsStrip({ contacts, photosBaseUrl }: { contacts: Contact[]; photosBaseUrl: string }) {
  const copyCall = useContactsStore((s) => callCopiesNumber(s.settings.dialer.id));
  const showToast = useContactsStore((s) => s.showToast);
  const presence = useContactsStore((s) => s.presence);

  const act = async (c: Contact, e: React.MouseEvent) => {
    const run = (p: Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => p.then((r) => { if (!r.ok) showToast(r.error, "error"); else if (r.message) showToast(r.message); });
    if (e.shiftKey && c.email) return run(window.contacts.email(c.email, c.id));
    const action = e.altKey ? "sms" : "call";
    const number = preferredPhone(c, action);
    if (number) return run(window.contacts.dial({ action, phone: number.phone, contactId: c.id }));
    if (c.email) return run(window.contacts.email(c.email, c.id));
  };

  return (
    <div className="no-drag relative z-10 px-3 pb-2">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
        <Clock className="h-3 w-3" /> Recent
      </div>
      <div className="flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {contacts.map((c) => (
          <Tooltip key={c.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => void act(c, e)}
                aria-label={`${copyCall ? "Copy calling number for" : "Call"} ${c.name}`}
                className="group/recent flex w-14 shrink-0 flex-col items-center gap-1 rounded-xl py-1 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Avatar contact={c} photosBaseUrl={photosBaseUrl} size={38} presence={c.m365?.kind === "user" ? presence[c.m365.id] : undefined} />
                <span className="w-full truncate text-center text-[11px] leading-tight text-foreground/85">{c.name.split(" ")[0]}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {c.name} · click to call{c.email ? ", Shift-click to email" : ""}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
