import { Copy } from "lucide-react";
import { useContactsStore } from "@renderer/store/useContacts";

/** Inline phone / email that copies itself on click. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const showToast = useContactsStore((s) => s.showToast);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      showToast(`Copied ${label}`);
    } catch {
      showToast("Couldn't access the clipboard", "error");
    }
  };
  return (
    <button
      type="button"
      onClick={(e) => void copy(e)}
      title={`Copy ${label}`}
      className="no-drag inline-flex max-w-full items-center gap-1 truncate rounded px-1 -mx-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
    >
      <span className="truncate">{label}</span>
      <Copy className="h-3 w-3 shrink-0 opacity-60" />
    </button>
  );
}
