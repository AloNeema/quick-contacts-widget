import { useEffect, useState } from "react";
import { ImagePlus, Link2, Star, Trash2, Upload } from "lucide-react";
import type { Contact, PhoneLabel } from "@shared/types";
import { createContact, hueForName } from "@shared/merge";
import { normalizeEmail, normalizeUsPhone, preferredPhone } from "@shared/phone";
import { Button } from "@renderer/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@renderer/components/ui/dialog";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import { Avatar } from "@renderer/widget/Avatar";
import { useContactsStore } from "@renderer/store/useContacts";
import type { SignatureDraft } from "@shared/signature";

export function ContactForm({ contact, signature, onClose, onOpenExisting }: { contact: Contact | null; signature?: SignatureDraft; onClose: () => void; onOpenExisting?: (contact: Contact) => void }) {
  const contacts = useContactsStore((s) => s.contacts);
  const groups = Array.from(new Set(contacts.map((c) => c.group?.trim()).filter((g): g is string => Boolean(g)))).sort();
  const photosBaseUrl = useContactsStore((s) => s.photosBaseUrl);
  const setContacts = useContactsStore((s) => s.setContacts);
  const showToast = useContactsStore((s) => s.showToast);

  const [draft, setDraft] = useState<Contact>(() => contact ?? createContact(signature?.fields ?? { name: "" }, contacts.length));
  const [phoneText, setPhoneText] = useState(contact?.phone ?? signature?.fields.phone ?? "");
  const [mobileText, setMobileText] = useState(contact?.mobilePhone ?? signature?.fields.mobilePhone ?? "");
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const duplicate = signature && contacts.find(c => c.id !== draft.id && c.email && normalizeEmail(c.email) === normalizeEmail(draft.email));
  const sharedNumber = signature && contacts.find(c => c.id !== draft.id && [c.phone, c.mobilePhone].some(n => n && [normalizeUsPhone(phoneText), normalizeUsPhone(mobileText)].includes(n)));

  // Photo changes are saved immediately by the main process; mirror them in the draft.
  const live = contacts.find((c) => c.id === draft.id);
  useEffect(() => {
    if (live && live.photo !== draft.photo) setDraft((d) => ({ ...d, photo: live.photo }));
  }, [live, draft.photo]);

  const isNew = !contact;
  const set = <K extends keyof Contact>(k: K, v: Contact[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const ensureSaved = async (): Promise<boolean> => {
    if (signature && !contacts.some(c => c.id === draft.id)) {
      setError("Review and add the contact first. You can add a photo afterward by editing it.");
      return false;
    }
    // Photos attach to a stored contact, so a brand-new contact is saved first.
    if (!isNew || contacts.some((c) => c.id === draft.id)) return true;
    const name = draft.name.trim();
    if (!name) {
      setError("Enter a name before adding a photo.");
      return false;
    }
    setContacts(await window.contacts.upsertContact({ ...draft, name, hue: hueForName(name) }));
    return true;
  };

  const pickPhoto = async () => {
    if (!(await ensureSaved())) return;
    const result = await window.contacts.pickPhoto(draft.id);
    if (result) setContacts(result);
  };
  const dropPhoto = async (file: File) => {
    if (!(await ensureSaved())) return;
    try {
      setContacts(await window.contacts.setPhotoFromFile(draft.id, file));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not use that image", "error");
    }
  };
  const applyPhotoUrl = async () => {
    if (!photoUrl.trim() || !(await ensureSaved())) return;
    try {
      setContacts(await window.contacts.setPhotoFromUrl(draft.id, photoUrl.trim()));
      setPhotoUrl("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not use that URL", "error");
    }
  };
  const removePhoto = async () => setContacts(await window.contacts.deletePhoto(draft.id));

  const submit = async () => {
    if (saving) return;
    const name = draft.name.trim();
    const phone = phoneText.trim() ? normalizeUsPhone(phoneText) : "";
    const mobilePhone = mobileText.trim() ? normalizeUsPhone(mobileText) : "";
    const email = draft.email?.trim() ? normalizeEmail(draft.email) : "";
    if (!name) return setError("Name is required.");
    if (phoneText.trim() && !phone) return setError("Office phone must be a 10-digit US number.");
    if (mobileText.trim() && !mobilePhone) return setError("Cell phone must be a 10-digit US number.");
    if (draft.email?.trim() && !email) return setError("That email address doesn't look right.");
    if (!phone && !mobilePhone && !email) return setError("Add a phone number or an email so the quick actions have something to use.");
    const now = new Date().toISOString();
    const next: Contact = {
      ...draft,
      name,
      title: draft.title?.trim() || undefined,
      company: draft.company?.trim() || undefined,
      linkedinUrl: draft.linkedinUrl?.trim() || undefined,
      website: draft.website?.trim() || undefined,
      group: draft.group?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      phone: phone || undefined,
      mobilePhone: mobilePhone || undefined,
      email: email || undefined,
      hue: contact ? draft.hue : hueForName(name),
      updatedAt: now,
    };
    setSaving(true);
    try {
      setContacts(await window.contacts.upsertContact(next));
      showToast(isNew ? `Added ${name}` : `Saved ${name}`);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save this contact. Your draft is still here."); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{signature ? "Review signature details" : isNew ? "Add contact" : `Edit ${contact.name}`}</DialogTitle>
          <DialogDescription>{signature ? "These are suggestions. Check the name, company, email and Office/Cell numbers, then choose your call and text stars. Nothing is added until you confirm." : "Phone numbers are stored as US numbers. Photos are copied into the widget's own folder."}</DialogDescription>
        </DialogHeader>

        {signature ? <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
          {signature.warnings.length ? <ul className="list-disc space-y-1 pl-4">{signature.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
          <details><summary className="cursor-pointer font-medium">Original signature</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-muted-foreground">{signature.source}</pre></details>
          {duplicate ? <p role="status">This email already belongs to <strong>{duplicate.name}</strong>. {onOpenExisting ? <button className="underline" onClick={() => onOpenExisting(duplicate)}>Edit that contact instead</button> : null} Adding here creates a separate contact.</p>
            : sharedNumber ? <p role="status">This phone number also appears on <strong>{sharedNumber.name}</strong>. It may be a shared office line; check before adding.</p> : null}
        </div> : null}

        <div className="grid grid-cols-[auto_1fr] gap-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void dropPhoto(file);
            }}
            className={`flex w-36 flex-col items-center gap-2 rounded-xl border border-dashed p-3 text-center transition-colors ${dragging ? "border-primary bg-primary/10" : ""}`}
          >
            <Avatar contact={{ ...draft, photo: live?.photo ?? draft.photo }} photosBaseUrl={photosBaseUrl} size={88} />
            <p className="text-[11px] leading-tight text-muted-foreground">Drop an image here</p>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => void pickPhoto()} aria-label="Choose photo">
                <Upload />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void removePhoto()} disabled={!live?.photo && !draft.photo} aria-label="Remove photo">
                <Trash2 />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" className="col-span-2">
              <Input autoFocus value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Doe" />
            </Field>
            <Field label="Title">
              <Input value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="VP, Lending" />
            </Field>
            <Field label="Company">
              <Input value={draft.company ?? ""} onChange={(e) => set("company", e.target.value)} placeholder="Acme Bank" />
            </Field>
            <div className="col-span-2 space-y-2">
              {(["office", "cell"] as PhoneLabel[]).map((label) => {
                const isOffice = label === "office";
                const value = isOffice ? phoneText : mobileText;
                const phoneDraft = { ...draft, phone: phoneText.trim(), mobilePhone: mobileText.trim() };
                return (
                  <Field key={label} label={isOffice ? "Office phone" : "Cell phone"}>
                    <div className="flex items-center gap-1">
                      <Input aria-label={isOffice ? "Office phone" : "Cell phone"} value={value} onChange={(e) => isOffice ? setPhoneText(e.target.value) : setMobileText(e.target.value)} placeholder="(555) 123-4567" inputMode="tel" className="min-w-0 flex-1" />
                      {(["call", "sms"] as const).map((action) => {
                        const selected = preferredPhone(phoneDraft, action)?.label === label;
                        const actionName = action === "call" ? "calls" : "texts";
                        return (
                          <button key={action} type="button" disabled={!value.trim()} aria-pressed={selected} aria-label={`Use ${label} for ${actionName}`} title={`Default for ${actionName}`} onClick={() => set(action === "call" ? "defaultCallPhone" : "defaultTextPhone", label)} className={`inline-flex h-9 items-center gap-1 rounded-md px-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30 ${selected ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                            <Star className={`h-3 w-3 ${selected ? "fill-current" : ""}`} /> {action === "call" ? "Call" : "Text"}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                );
              })}
              <p className="text-[11px] text-muted-foreground">Stars choose the default for calls and texts.</p>
            </div>
            <Field label="Email">
              <Input list={signature ? "signature-emails" : undefined} value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="jane@acme.com" inputMode="email" />
              {signature ? <datalist id="signature-emails">{signature.emails.map(email => <option key={email} value={email} />)}</datalist> : null}
            </Field>
            <Field label="Group / tag">
              <Input list="contact-groups" value={draft.group ?? ""} onChange={(e) => set("group", e.target.value)} placeholder="Lenders, Brokers, Internal…" />
              <datalist id="contact-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
            </Field>
            <Field label="Notes">
              <Input value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Prefers texts after 3pm" />
            </Field>
            <Field label="Company website (for the logo)" className="col-span-2">
              <Input value={draft.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="Optional. Defaults to their email domain, e.g. acmebank.com" />
            </Field>
            <Field label="LinkedIn profile URL" className="col-span-2">
              <Input value={draft.linkedinUrl ?? ""} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="https://www.linkedin.com/in/…" />
            </Field>
            <Field label="Photo from image URL" className="col-span-2">
              <div className="flex gap-2">
                <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…/headshot.jpg" />
                <Button type="button" variant="secondary" onClick={() => void applyPhotoUrl()} disabled={!photoUrl.trim()}>
                  <Link2 /> Use
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                <ImagePlus className="mr-1 inline h-3 w-3" />
                LinkedIn doesn't allow pulling photos automatically. Right-click their profile photo, copy the image address, and paste it here, or save it and drop the file.
              </p>
            </Field>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={() => void submit()}>{saving ? "Saving…" : duplicate ? "Add separate contact" : isNew ? "Add contact" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
