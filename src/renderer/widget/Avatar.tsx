import { useState } from "react";
import { initialsOf } from "@shared/merge";
import type { Contact, PresenceAvailability } from "@shared/types";
import { cn } from "@renderer/lib/utils";
import { logoSrc, photoSrc, useContactsStore } from "@renderer/store/useContacts";

const PRESENCE_COLOR: Record<PresenceAvailability, string> = {
  Available: "#22c55e",
  Busy: "#ef4444",
  DoNotDisturb: "#ef4444",
  Away: "#f59e0b",
  BeRightBack: "#f59e0b",
  Offline: "#9ca3af",
  PresenceUnknown: "#9ca3af",
};

export function Avatar({
  contact,
  photosBaseUrl,
  size = 40,
  className,
  presence,
}: {
  contact: Contact;
  photosBaseUrl: string;
  size?: number;
  className?: string;
  presence?: { availability: PresenceAvailability; activity: string };
}) {
  const inner = <AvatarImage contact={contact} photosBaseUrl={photosBaseUrl} size={size} className={className} />;
  if (!presence) return inner;
  const dot = Math.max(8, Math.round(size * 0.28));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={presence.activity}>
      {inner}
      <span
        aria-label={presence.availability}
        className="absolute bottom-0 right-0 rounded-full ring-2 ring-[hsl(var(--glass-bg))]"
        style={{ width: dot, height: dot, background: PRESENCE_COLOR[presence.availability] ?? "#9ca3af", boxShadow: `0 0 6px ${PRESENCE_COLOR[presence.availability] ?? "#9ca3af"}80` }}
      />
    </div>
  );
}

function AvatarImage({ contact, photosBaseUrl, size, className }: { contact: Contact; photosBaseUrl: string; size: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const logosOn = useContactsStore((s) => s.settings.companyLogos);
  const src = broken ? undefined : photoSrc(contact, photosBaseUrl);
  const logo = logoBroken ? undefined : logoSrc(contact, photosBaseUrl, logosOn);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (!src && logo) {
    // Logos are usually square marks on transparent or white: show them whole on a white disc.
    return (
      <div style={style} className={cn("avatar-ring flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white", className)} title={contact.logo?.domain}>
        <img
          src={logo}
          alt=""
          draggable={false}
          onError={() => setLogoBroken(true)}
          style={{ width: Math.round(size * 0.76), height: Math.round(size * 0.76) }}
          className="object-contain"
        />
      </div>
    );
  }
  if (src) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
        style={style}
        className={cn("avatar-ring shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <div
      style={{
        ...style,
        background: `radial-gradient(circle at 30% 25%, hsl(0 0% 100% / 0.28), transparent 45%), linear-gradient(135deg, hsl(${contact.hue} 72% 58%), hsl(${(contact.hue + 40) % 360} 70% 40%))`,
        textShadow: "0 1px 2px rgb(0 0 0 / 0.25)",
      }}
      className={cn("avatar-ring flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-wide text-white", className)}
      aria-hidden
    >
      {initialsOf(contact.name)}
    </div>
  );
}
