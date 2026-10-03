import { useEffect, useState } from "react";
import { CalendarClock, ExternalLink, Loader2, Mail, StickyNote, Video } from "lucide-react";
import type { Contact, ContactContext } from "@shared/types";
import { relativeTime } from "@shared/merge";
import { useContactsStore } from "@renderer/store/useContacts";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 86_400_000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  if (tomorrow) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

/** Inline drawer under a row: note, last email and next meeting (Outlook), plus a link into the record. */
export function ContactDetails({ contact }: { contact: Contact }) {
  const showToast = useContactsStore((s) => s.showToast);
  const signedIn = useContactsStore((s) => s.m365.signedIn);
  const [ctx, setCtx] = useState<ContactContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    window.contacts
      .getContext(contact.id)
      .then((c) => alive && setCtx(c))
      .catch((err) => alive && setCtx({ contactId: contact.id, fetchedAt: "", available: false, error: err instanceof Error ? err.message : String(err) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [contact.id]);

  const open = (url?: string) => url && void window.contacts.openLink(url).then((r) => !r.ok && showToast(r.error, "error"));

  return (
    <div className="no-drag mt-2 space-y-1.5 animate-fade-up pl-[52px] pr-1 text-xs" onClick={(e) => e.stopPropagation()}>
      {contact.notes ? (
        <p className="flex items-start gap-1.5 text-foreground/80">
          <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="whitespace-pre-wrap">{contact.notes}</span>
        </p>
      ) : null}

      {!signedIn ? (
        <p className="text-muted-foreground">
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => void window.contacts.openSettings("m365")}>Sign in to Microsoft 365</button> to see your last email and next meeting here.
        </p>
      ) : loading && !ctx ? (
        <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Checking Outlook…</p>
      ) : ctx ? (
        <>
          {ctx.lastEmail ? (
            <button type="button" onClick={() => open(ctx.lastEmail?.webLink)} className="detail-card group/card flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-foreground/10">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium text-foreground/90">{ctx.lastEmail.subject}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{ctx.lastEmail.direction === "in" ? "from them" : "from you"} · {relativeTime(ctx.lastEmail.receivedAt)}</span>
                </span>
                {ctx.lastEmail.preview ? <span className="line-clamp-1 text-muted-foreground">{ctx.lastEmail.preview}</span> : null}
              </span>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/card:opacity-70" />
            </button>
          ) : null}
          {ctx.nextMeeting ? (
            <div className="detail-card flex items-start gap-2 rounded-xl px-2.5 py-2">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <button type="button" onClick={() => open(ctx.nextMeeting?.webLink)} className="min-w-0 flex-1 text-left hover:underline underline-offset-2">
                <span className="block truncate font-medium text-foreground/90">{ctx.nextMeeting.subject}</span>
                <span className="block text-muted-foreground">{fmtWhen(ctx.nextMeeting.start)}{ctx.nextMeeting.location ? ` · ${ctx.nextMeeting.location}` : ""}</span>
              </button>
              {ctx.nextMeeting.joinUrl ? (
                <button type="button" onClick={() => open(ctx.nextMeeting?.joinUrl)} className="action-btn !h-7 !w-7" aria-label="Join meeting"><Video className="h-3.5 w-3.5" /></button>
              ) : null}
            </div>
          ) : null}
          {ctx.available && !ctx.lastEmail && !ctx.nextMeeting && !ctx.error ? <p className="text-muted-foreground">No recent email or upcoming meeting with {contact.name.split(" ")[0]}.</p> : null}
          {ctx.error ? <p className="text-muted-foreground">{ctx.error}</p> : null}
        </>
      ) : null}
    </div>
  );
}
