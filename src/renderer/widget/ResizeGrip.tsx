import { useRef } from "react";
import { cn } from "@renderer/lib/utils";

type Side = "left" | "right";

/** Pointer-capture drag that forwards screen-space deltas to the main process. */
function useResizeDrag(axis: "both" | "x") {
  const last = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = { x: e.screenX, y: e.screenY };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!last.current) return;
    const dx = e.screenX - last.current.x;
    const dy = axis === "x" ? 0 : e.screenY - last.current.y;
    if (dx === 0 && dy === 0) return;
    last.current = { x: e.screenX, y: axis === "x" ? last.current.y : e.screenY };
    void window.contacts.resizeBy(dx, dy);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    last.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onLostPointerCapture: () => {
      last.current = null;
    },
  };
}

/**
 * Transparent frameless windows lose native resizing; this corner grip forwards drag deltas to the
 * main process. `side` is the corner it sits in: the inner edge when docked to the right of the screen.
 */
export function ResizeGrip({ side = "right" }: { side?: Side }) {
  const drag = useResizeDrag("both");
  return (
    <div
      role="separator"
      aria-label="Resize"
      title="Drag to resize"
      {...drag}
      className={cn(
        "no-drag absolute bottom-1 z-40 flex h-7 w-7 touch-none items-end p-1 opacity-40 hover:opacity-90",
        side === "right" ? "right-1 cursor-nwse-resize justify-end" : "left-1 cursor-nesw-resize justify-start",
      )}
    >
      <svg viewBox="0 0 16 16" className={cn("pointer-events-none h-4 w-4 text-foreground", side === "left" && "-scale-x-100")} fill="currentColor" aria-hidden>
        <circle cx="13" cy="13" r="1.3" />
        <circle cx="9" cy="13" r="1.3" />
        <circle cx="13" cy="9" r="1.3" />
        <circle cx="5" cy="13" r="1.3" />
        <circle cx="9" cy="9" r="1.3" />
        <circle cx="13" cy="5" r="1.3" />
      </svg>
    </div>
  );
}

/** Full-height edge handle for widening the panel, so wider reading doesn't depend on finding the corner. */
export function ResizeEdge({ side = "right" }: { side?: Side }) {
  const drag = useResizeDrag("x");
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize width"
      title="Drag to make wider or narrower"
      {...drag}
      className={cn("no-drag group/edge absolute bottom-10 top-12 z-30 w-2 touch-none cursor-ew-resize", side === "right" ? "right-0" : "left-0")}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 h-10 w-1 -translate-y-1/2 rounded-full transition-colors group-hover/edge:bg-foreground/30",
          side === "right" ? "right-0.5" : "left-0.5",
        )}
      />
    </div>
  );
}
