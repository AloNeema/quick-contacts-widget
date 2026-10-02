import { useState } from "react";
import { initialsOf } from "@shared/merge";
import type { Contact } from "@shared/types";
import { cn } from "@renderer/lib/utils";
import { photoSrc } from "@renderer/store/useContacts";

export function Avatar({ contact, photosBaseUrl, size = 40, className }: { contact: Contact; photosBaseUrl: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = broken ? undefined : photoSrc(contact, photosBaseUrl);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (src) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
        style={style}
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-white/15 shadow-sm", className)}
      />
    );
  }
  return (
    <div
      style={{
        ...style,
        background: `linear-gradient(135deg, hsl(${contact.hue} 70% 55%), hsl(${(contact.hue + 40) % 360} 70% 40%))`,
      }}
      className={cn("flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-wide text-white ring-1 ring-white/15 shadow-sm", className)}
      aria-hidden
    >
      {initialsOf(contact.name)}
    </div>
  );
}
