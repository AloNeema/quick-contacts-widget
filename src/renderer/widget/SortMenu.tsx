import { useEffect, useRef, useState } from "react";
import { ArrowDownAZ, ArrowUpDown, Check, Clock, Flame, GripVertical } from "lucide-react";
import type { ContactSort } from "@shared/types";
import { cn } from "@renderer/lib/utils";

const OPTIONS: { value: ContactSort; label: string; Icon: typeof Clock }[] = [
  { value: "manual", label: "My order", Icon: GripVertical },
  { value: "name", label: "A to Z", Icon: ArrowDownAZ },
  { value: "recent", label: "Recently contacted", Icon: Clock },
  { value: "frequent", label: "Most contacted", Icon: Flame },
];

/** Small popover to pick the list order; pinned contacts always stay on top. */
export function SortMenu({ value, onChange }: { value: ContactSort; onChange: (v: ContactSort) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  return (
    <div ref={ref} className="no-drag relative shrink-0">
      <button
        type="button"
        aria-label={`Sort: ${current.label}`}
        title={`Sort: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        className={cn("glass-inset inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground", value !== "manual" && "text-primary")}
      >
        {value === "manual" ? <ArrowUpDown className="h-3.5 w-3.5" /> : <current.Icon className="h-3.5 w-3.5" />}
      </button>
      {open ? (
        <div role="menu" className="menu-glass absolute right-0 top-9 z-30 w-48 overflow-hidden rounded-xl p-1 animate-fade-up">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sort by</p>
          {OPTIONS.map(({ value: v, label, Icon }) => (
            <button
              key={v}
              type="button"
              role="menuitemradio"
              aria-checked={v === value}
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-foreground/90 hover:bg-foreground/10"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1">{label}</span>
              {v === value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            </button>
          ))}
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">Pinned contacts stay on top. "Most contacted" counts your calls, texts and emails from the widget.</p>
        </div>
      ) : null}
    </div>
  );
}
