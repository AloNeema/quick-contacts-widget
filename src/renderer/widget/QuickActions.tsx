import { Linkedin, Mail, MessageSquare, Phone } from "lucide-react";
import type { Contact } from "@shared/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";
import { useContactsStore } from "@renderer/store/useContacts";

function Action({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="action-btn no-drag" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function QuickActions({ contact, compact }: { contact: Contact; compact?: boolean }) {
  const showToast = useContactsStore((s) => s.showToast);
  const iconClass = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  const run = async (p: Promise<{ ok: true } | { ok: false; error: string }>) => {
    const r = await p;
    if (!r.ok) showToast(r.error, "error");
  };

  return (
    <div className={compact ? "flex items-center gap-1 [&_.action-btn]:h-7 [&_.action-btn]:w-7" : "flex items-center gap-1"}>
      <Action label={contact.phone ? `Call ${contact.name.split(" ")[0]}` : "No phone"} disabled={!contact.phone} onClick={() => void run(window.contacts.dial({ action: "call", phone: contact.phone!, contactId: contact.id }))}>
        <Phone className={iconClass} />
      </Action>
      <Action label={contact.phone ? "Text" : "No phone"} disabled={!contact.phone} onClick={() => void run(window.contacts.dial({ action: "sms", phone: contact.phone!, contactId: contact.id }))}>
        <MessageSquare className={iconClass} />
      </Action>
      <Action label={contact.email ? `Email ${contact.email}` : "No email"} disabled={!contact.email} onClick={() => void run(window.contacts.email(contact.email!, contact.id))}>
        <Mail className={iconClass} />
      </Action>
      {contact.linkedinUrl ? (
        <Action label="Open LinkedIn" onClick={() => void run(window.contacts.openLink(contact.linkedinUrl!))}>
          <Linkedin className={iconClass} />
        </Action>
      ) : null}
    </div>
  );
}
