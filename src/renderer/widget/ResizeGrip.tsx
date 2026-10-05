import { useRef } from "react";

/** Transparent frameless windows lose native resizing; this grip forwards drag deltas to the main process. */
export function ResizeGrip() {
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
    const dy = e.screenY - last.current.y;
    if (dx === 0 && dy === 0) return;
    last.current = { x: e.screenX, y: e.screenY };
    void window.contacts.resizeBy(dx, dy);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    last.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return (
    <div
      role="separator"
      aria-label="Resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={() => { last.current = null; }}
      className="no-drag absolute bottom-1 right-1 z-40 flex h-7 w-7 touch-none cursor-nwse-resize items-end justify-end p-1 opacity-40 hover:opacity-90"
    >
      <svg viewBox="0 0 16 16" className="pointer-events-none h-4 w-4 text-foreground" fill="currentColor" aria-hidden>
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
