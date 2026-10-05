import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import type { Contact, ContactSort } from "@shared/types";
import { useContactsStore } from "@renderer/store/useContacts";

const MIME = "application/x-qcf-contact";

export function useContactReorder(visible: Contact[], sort: ContactSort) {
  const source = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; side: "before" | "after" } | null>(null);
  const clear = () => { source.current = null; setDragging(null); setTarget(null); };
  const move = async (id: string, targetId: string, side: "before" | "after") => {
    if (id === targetId) return;
    try {
      const next = await window.contacts.reorderContact(id, targetId, side, sort);
      useContactsStore.setState(next);
    } catch (err) {
      useContactsStore.getState().showToast(err instanceof Error ? err.message : "Could not save the new order", "error");
    }
  };
  const dropSide = (e: React.DragEvent<HTMLElement>) => e.clientY < e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2 ? "before" : "after";
  return {
    rowProps: (id: string) => ({
      "data-contact-id": id,
      onDragOver: (e: React.DragEvent<HTMLElement>) => {
        if (!source.current || !e.dataTransfer.types.includes(MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setTarget({ id, side: dropSide(e) });
        // Keep long contact lists usable without repeated short drags.
        let el = e.currentTarget.parentElement;
        while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
        if (el && ["auto", "scroll"].includes(getComputedStyle(el).overflowY)) {
          const rect = el.getBoundingClientRect();
          if (e.clientY < rect.top + 32) el.scrollBy(0, -12);
          else if (e.clientY > rect.bottom - 32) el.scrollBy(0, 12);
        }
      },
      onDrop: (e: React.DragEvent<HTMLElement>) => {
        if (!source.current || !e.dataTransfer.types.includes(MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        const idFromDrag = source.current;
        const side = dropSide(e);
        clear();
        void move(idFromDrag, id, side);
      },
      onDragLeave: (e: React.DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTarget(null);
      },
    }),
    handleProps: (id: string, name: string) => ({
      draggable: true,
      "aria-label": `Reorder ${name}`,
      title: "Drag to reorder. Alt + Up/Down also moves this contact.",
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      onDragStart: (e: React.DragEvent<HTMLElement>) => {
        e.stopPropagation();
        source.current = id;
        setDragging(id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(MIME, id);
        const row = e.currentTarget.closest<HTMLElement>("[data-contact-id]");
        if (row) e.dataTransfer.setDragImage(row, 16, 16);
      },
      onDragEnd: clear,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (!e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const direction = e.key === "ArrowUp" ? -1 : 1;
        const neighbor = visible[visible.findIndex((c) => c.id === id) + direction];
        if (neighbor) void move(id, neighbor.id, direction === -1 ? "before" : "after");
      },
    }),
    rowClass: (id: string) => `${dragging === id ? "opacity-40" : ""} ${target?.id === id && dragging !== id ? target.side === "before" ? "shadow-[inset_0_2px_0_hsl(var(--primary))]" : "shadow-[inset_0_-2px_0_hsl(var(--primary))]" : ""}`,
  };
}

export function ContactDragHandle({ reorder, contact }: { reorder: ReturnType<typeof useContactReorder>; contact: Contact }) {
  return (
    <button type="button" {...reorder.handleProps(contact.id, contact.name)} className="no-drag flex w-4 shrink-0 cursor-grab items-center justify-center self-stretch rounded text-muted-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing">
      <GripVertical className="pointer-events-none h-3.5 w-3.5" />
    </button>
  );
}
