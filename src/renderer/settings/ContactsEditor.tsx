import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import type { Contact } from "@shared/types";
import { filterContacts, moveContact, normalizeOrder } from "@shared/merge";
import { formatPhoneForDisplay } from "@shared/phone";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Avatar } from "@renderer/widget/Avatar";
import { QuickActions } from "@renderer/widget/QuickActions";
import { useContactsStore } from "@renderer/store/useContacts";
import { ContactForm } from "./ContactForm";

export function ContactsEditor() {
  const contacts = useContactsStore((s) => s.contacts);
  const photosBaseUrl = useContactsStore((s) => s.photosBaseUrl);
  const setContacts = useContactsStore((s) => s.setContacts);
  const showToast = useContactsStore((s) => s.showToast);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Contact | null>(null);

  const visible = useMemo(() => filterContacts(contacts, query), [contacts, query]);

  const save = async (next: Contact[]) => {
    setContacts(normalizeOrder(next));
    setContacts(await window.contacts.saveContacts(next));
  };
  const togglePin = (c: Contact) => void save(contacts.map((x) => (x.id === c.id ? { ...x, pinned: !x.pinned, updatedAt: new Date().toISOString() } : x)));
  const move = (c: Contact, dir: -1 | 1) => void save(moveContact(contacts, c.id, dir));
  const remove = async (c: Contact) => {
    setConfirmDelete(null);
    setContacts(await window.contacts.deleteContact(c.id));
    showToast(`Removed ${c.name}`);
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a contact" className="pl-8" />
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus /> Add contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing here yet. Add a contact or use the Import tab to load a spreadsheet.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {visible.map((c, i) => (
            <li key={c.id} className="group flex items-center gap-3 px-3 py-2.5">
              <Avatar contact={c} photosBaseUrl={photosBaseUrl} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  {c.pinned ? <Pin className="h-3 w-3 fill-current text-primary" /> : null}
                  {c.group ? <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">{c.group}</span> : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[c.title, c.company].filter(Boolean).join(" · ")}
                  {(c.title || c.company) && (c.phone || c.email) ? " · " : ""}
                  {[formatPhoneForDisplay(c.phone), c.email].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="hidden md:block">
                <QuickActions contact={c} compact />
              </div>
              <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={c.pinned ? "Unpin" : "Pin to top"} onClick={() => togglePin(c)}>
                  {c.pinned ? <PinOff /> : <Pin />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move up" disabled={i === 0 || Boolean(query)} onClick={() => move(c, -1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move down" disabled={i === visible.length - 1 || Boolean(query)} onClick={() => move(c, 1)}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => setEditing(c)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Delete" onClick={() => setConfirmDelete(c)}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? <ContactForm contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal>
          <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
            <h2 className="text-base font-semibold">Remove {confirmDelete.name}?</h2>
            <p className="mt-1 text-sm text-muted-foreground">This deletes the contact and its photo from the widget. Your spreadsheet is not changed.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => void remove(confirmDelete)}>Remove</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
