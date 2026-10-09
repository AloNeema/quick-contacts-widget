import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Loader2, TriangleAlert, UserPlus, X } from "lucide-react";
import type { IncomingContact } from "@shared/types";
import { createContact } from "@shared/merge";
import { formatPhoneForDisplay, normalizeEmail } from "@shared/phone";
import { finalizeContactDraft } from "@shared/contactDraft";
import { parseSignature, SIGNATURE_LIMIT, type SignatureDraft } from "@shared/signature";
import { useContactsStore } from "@renderer/store/useContacts";

type FieldKey = "name" | "title" | "company" | "email" | "phone" | "mobilePhone";
type Fields = Record<FieldKey, string>;

const EMPTY: Fields = { name: "", title: "", company: "", email: "", phone: "", mobilePhone: "" };
const LABELS: { key: FieldKey; label: string; placeholder: string; inputMode?: "email" | "tel" }[] = [
  { key: "name", label: "Name", placeholder: "Jane Doe" },
  { key: "title", label: "Title", placeholder: "VP, Lending" },
  { key: "company", label: "Company", placeholder: "Acme Capital" },
  { key: "email", label: "Email", placeholder: "jane@acme.com", inputMode: "email" },
  { key: "phone", label: "Office", placeholder: "(555) 123-4567", inputMode: "tel" },
  { key: "mobilePhone", label: "Cell", placeholder: "(555) 123-4567", inputMode: "tel" },
];

const fromSignature = (f: IncomingContact): Fields => ({
  name: f.name ?? "",
  title: f.title ?? "",
  company: f.company ?? "",
  email: f.email ?? "",
  phone: f.phone ? formatPhoneForDisplay(f.phone) : "",
  mobilePhone: f.mobilePhone ? formatPhoneForDisplay(f.mobilePhone) : "",
});

/**
 * Widget quick add: paste one email signature, check the suggested details, add. Parsing is the
 * same text-only reader as Settings › Contacts › Paste signature; nothing is saved until Add.
 */
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const contacts = useContactsStore((s) => s.contacts);
  const setContacts = useContactsStore((s) => s.setContacts);
  const showToast = useContactsStore((s) => s.showToast);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<SignatureDraft | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  // Fields the user typed in keep their value when the signature text changes.
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    pasteRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const read = (value: string) => {
    setText(value);
    setError("");
    if (!value.trim() || value.length > SIGNATURE_LIMIT) {
      setParsed(null);
      return;
    }
    try {
      const draft = parseSignature(value);
      setParsed(draft);
      const next = fromSignature(draft.fields);
      setFields((prev) => {
        const merged = { ...next };
        for (const k of touched) merged[k] = prev[k];
        return merged;
      });
    } catch (err) {
      setParsed(null);
      setError(err instanceof Error ? err.message : "Could not read this signature.");
    }
  };

  const duplicate = useMemo(() => {
    const email = fields.email.trim() ? normalizeEmail(fields.email) : "";
    return email ? contacts.find((c) => c.email && normalizeEmail(c.email) === email) : undefined;
  }, [contacts, fields.email]);

  const add = async () => {
    if (saving) return;
    const base = createContact({ ...(parsed?.fields ?? { name: "" }), name: fields.name, title: fields.title, company: fields.company, email: fields.email }, contacts.length);
    const result = finalizeContactDraft(base, fields.phone, fields.mobilePhone, { keepHue: false });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSaving(true);
    try {
      setContacts(await window.contacts.upsertContact(result.contact));
      showToast(`Added ${result.contact.name}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this contact. Your details are still here.");
    } finally {
      setSaving(false);
    }
  };

  const tooLong = text.length > SIGNATURE_LIMIT;
  const ready = Boolean(parsed) || Object.values(fields).some((v) => v.trim());

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="quick-add-heading" className="email-preview no-drag absolute inset-0 z-50 flex flex-col animate-fade-up">
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3.5">
        <UserPlus className="h-4 w-4 text-primary" aria-hidden />
        <h2 id="quick-add-heading" className="min-w-0 flex-1 truncate text-[14px] font-semibold">Add from a signature</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 pb-3">
        <div>
          <label htmlFor="quick-add-paste" className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ClipboardPaste className="h-3 w-3" aria-hidden /> Paste the signature from Outlook ({navigator.platform.startsWith("Mac") ? "⌘V" : "Ctrl+V"})
          </label>
          <textarea
            id="quick-add-paste"
            ref={pasteRef}
            rows={text ? 4 : 6}
            value={text}
            onChange={(e) => read(e.target.value)}
            onPaste={(e) => {
              if (!e.clipboardData.getData("text/plain")) {
                e.preventDefault();
                setError("This clipboard item has no text. Copy the signature's text rather than its image.");
              }
            }}
            placeholder={"Jane Doe\nVP, Lending\nAcme Capital\nOffice: (202) 555-0101\nMobile: (202) 555-0102\njane@acme.com"}
            className="glass-inset w-full resize-none rounded-xl bg-transparent px-3 py-2 text-[12px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          />
          {tooLong ? <p role="alert" className="alert-error mt-1 rounded-lg px-2.5 py-1.5 text-[12px]">That's too long. Paste just the signature (up to 12,000 characters).</p> : null}
        </div>

        {ready ? (
          <>
            {parsed?.warnings.length ? (
              <ul className="space-y-1 rounded-xl bg-foreground/[0.06] px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                {parsed.warnings.map((w) => (
                  <li key={w} className="flex gap-1.5">
                    <TriangleAlert className="mt-px h-3 w-3 shrink-0 text-amber-400" aria-hidden /> <span>{w}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="grid grid-cols-[64px_1fr] items-center gap-x-2 gap-y-1.5">
              {LABELS.map(({ key, label, placeholder, inputMode }) => (
                <div key={key} className="contents">
                  <label htmlFor={`quick-add-${key}`} className="text-[11px] text-muted-foreground">
                    {label}
                  </label>
                  <input
                    id={`quick-add-${key}`}
                    value={fields[key]}
                    list={key === "email" && parsed && parsed.emails.length > 1 ? "quick-add-emails" : undefined}
                    inputMode={inputMode}
                    placeholder={placeholder}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFields((f) => ({ ...f, [key]: v }));
                      setTouched((t) => new Set(t).add(key));
                      setError("");
                    }}
                    className="glass-inset h-8 min-w-0 rounded-lg bg-transparent px-2.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  />
                </div>
              ))}
            </div>
            {parsed && parsed.emails.length > 1 ? (
              <datalist id="quick-add-emails">
                {parsed.emails.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            ) : null}
            {duplicate ? (
              <p role="status" className="rounded-xl bg-foreground/[0.06] px-3 py-2 text-[11px] leading-snug">
                <strong>{duplicate.name}</strong> already has this email. Adding creates a separate contact.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Copy one person's signature in Outlook, paste it above, and the details fill in here for you to check. Images and logos aren't read. Nothing is saved until you click Add.
          </p>
        )}
        {error ? <p role="alert" className="alert-error rounded-lg px-2.5 py-1.5 text-[12px]">{error}</p> : null}
      </div>

      <div className="flex items-center gap-1.5 border-t border-foreground/10 px-3 py-2">
        <button type="button" className="fu-btn fu-btn-primary" disabled={!ready || saving || tooLong} onClick={() => void add()}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />} {duplicate ? "Add anyway" : "Add contact"}
        </button>
        <button type="button" className="fu-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
