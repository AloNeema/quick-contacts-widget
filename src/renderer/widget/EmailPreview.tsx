import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ExternalLink, Loader2, Paperclip, Reply } from "lucide-react";
import type { ClientEmailPreview, ClientItem } from "@shared/types";
import { cn } from "@renderer/lib/utils";

type Party = { name?: string; address: string };

const who = (p: Party) => (p.name && p.name !== p.address ? p.name : p.address);
const fmtSize = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

/**
 * Reading pane for a client's latest email, laid over the Clients list. The text is fetched on open
 * as plain text (never HTML), so nothing in the email can run or load in the widget.
 */
export function EmailPreview({
  item,
  onClose,
  onReply,
  onOpen,
  openLabel,
  busy,
}: {
  item: ClientItem;
  onClose: () => void;
  onReply: () => void;
  onOpen: () => void;
  openLabel: string;
  busy: boolean;
}) {
  const [preview, setPreview] = useState<ClientEmailPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(item.lastMessageId));
  const [showQuoted, setShowQuoted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Escape closes from anywhere: after Reply the clicked button is disabled and focus falls back to <body>.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!item.lastMessageId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    window.contacts
      .previewClientEmail(item.email, item.lastMessageId)
      .then((r) => {
        if (!alive) return;
        if (r.ok) setPreview(r.preview);
        else setError(r.error);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Could not load this email."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [item.email, item.lastMessageId, attempt]);

  const subject = preview?.subject || item.lastSubject || "(no subject)";
  const from: Party | undefined = preview?.from ?? (item.lastDirection === "in" ? { name: item.name, address: item.email } : undefined);
  const at = preview?.at ?? (item.lastDirection === "in" ? item.lastInboundAt : item.lastOutboundAt) ?? item.lastActivityAt;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-preview-subject"
      className="email-preview no-drag absolute inset-0 z-30 flex flex-col animate-fade-up"
    >
      <div className="flex items-center gap-1.5 px-2.5 pb-1.5">
        <button ref={closeRef} type="button" onClick={onClose} className="fu-btn !px-2" aria-label="Back to clients">
          <ArrowLeft className="h-3.5 w-3.5" /> Clients
        </button>
        <span className="ml-auto truncate text-[11px] text-muted-foreground">{item.lastDirection === "out" ? "You sent this" : `From ${item.name}`}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3">
        <h2 id="email-preview-subject" className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">
          {subject}
        </h2>
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
          {from ? (
            <>
              <dt>From</dt>
              <dd className="min-w-0 truncate text-foreground/90" title={from.address}>
                {who(from)} <span className="text-muted-foreground">&lt;{from.address}&gt;</span>
              </dd>
            </>
          ) : null}
          {preview?.to.length ? (
            <>
              <dt>To</dt>
              <dd className="min-w-0 truncate" title={preview.to.map((p) => p.address).join(", ")}>
                {preview.to.map(who).join(", ")}
              </dd>
            </>
          ) : null}
          {preview?.cc.length ? (
            <>
              <dt>Cc</dt>
              <dd className="min-w-0 truncate" title={preview.cc.map((p) => p.address).join(", ")}>
                {preview.cc.map(who).join(", ")}
              </dd>
            </>
          ) : null}
          <dt>Date</dt>
          <dd className="tabular-nums">{fmtDate(at)}</dd>
        </dl>

        {preview?.attachments.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Attachments">
            {preview.attachments.map((a, idx) => (
              <li key={`${a.name}-${idx}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[11px]">
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 text-muted-foreground">{fmtSize(a.size)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="my-3 h-px bg-foreground/10" />

        {loading && !preview ? (
          <div aria-live="polite">
            {item.lastPreview ? <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/70 [overflow-wrap:anywhere]">{item.lastPreview}</p> : null}
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading the full email…
            </p>
          </div>
        ) : preview ? (
          <>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed [overflow-wrap:anywhere]">{preview.body || "(This email has no text.)"}</p>
            {preview.truncated ? <p className="mt-2 text-[11px] text-muted-foreground">This email is long. Open it in Outlook to read the rest.</p> : null}
            {preview.quoted ? (
              <div className="mt-3">
                <button type="button" className="fu-btn" aria-expanded={showQuoted} onClick={() => setShowQuoted((v) => !v)}>
                  <ChevronDown className={cn("h-3 w-3 transition-transform", showQuoted && "rotate-180")} /> {showQuoted ? "Hide earlier messages" : "Show earlier messages"}
                </button>
                {showQuoted ? (
                  <p className="mt-2 whitespace-pre-wrap border-l-2 border-foreground/15 pl-2.5 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{preview.quoted}</p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div>
            {item.lastPreview ? <p className="whitespace-pre-wrap text-[13px] leading-relaxed [overflow-wrap:anywhere]">{item.lastPreview}</p> : null}
            <p role="alert" className="mt-2 rounded-lg alert-error px-2.5 py-1.5 text-[12px]">
              {error ?? "Check your inbox once to load the full email."}{" "}
              {item.lastMessageId ? (
                <button type="button" className="font-medium underline underline-offset-2" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </button>
              ) : null}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-foreground/10 px-3 py-2">
        <button type="button" className="fu-btn fu-btn-primary" disabled={busy} onClick={onReply}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Reply className="h-3 w-3" />} Reply
        </button>
        <button type="button" className="fu-btn" disabled={busy} onClick={onOpen}>
          <ExternalLink className="h-3 w-3" /> {openLabel}
        </button>
      </div>
    </div>
  );
}
