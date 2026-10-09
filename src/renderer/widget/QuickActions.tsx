import { Copy, Linkedin, Mail, MessageSquare, Phone } from "lucide-react";
import { callCopiesNumber, textCopiesNumber } from "@shared/dialer";
import type { Contact } from "@shared/types";
import { formatPhoneForDisplay, preferredPhone } from "@shared/phone";
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
  const copyCall = useContactsStore((s) => callCopiesNumber(s.settings.dialer.id));
  const copyText = useContactsStore((s) => textCopiesNumber(s.settings.dialer.id));
  const iconClass = compact ? "h-3.5 w-3.5" : "h-4 w-4";
  const call = preferredPhone(contact, "call");
  const text = preferredPhone(contact, "sms");

  const run = async (p: Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
    const r = await p;
    if (!r.ok) showToast(r.error, "error");
    else if (r.message) showToast(r.message);
  };

  return (
    <div className={compact ? "flex items-center gap-1 [&_.action-btn]:h-7 [&_.action-btn]:w-7" : "flex items-center gap-1"}>
      <Action label={call ? `${copyCall ? "Copy for call" : "Call"} ${call.label}: ${formatPhoneForDisplay(call.phone)}` : "No phone"} disabled={!call} onClick={() => call && void run(window.contacts.dial({ action: "call", phone: call.phone, contactId: contact.id }))}>
        <Phone className={iconClass} />
      </Action>
      <Action label={text ? `${copyText ? "Copy for text" : "Text"} ${text.label}: ${formatPhoneForDisplay(text.phone)}` : "No phone"} disabled={!text} onClick={() => text && void run(window.contacts.dial({ action: "sms", phone: text.phone, contactId: contact.id }))}>
        {copyText ? <Copy className={iconClass} /> : <MessageSquare className={iconClass} />}
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
