import { RefreshCw } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { Slider } from "@renderer/components/ui/slider";
import { Switch } from "@renderer/components/ui/switch";
import { useContactsStore } from "@renderer/store/useContacts";
import { cn } from "@renderer/lib/utils";

const ACCENTS = [212, 262, 330, 160, 24, 45];

export function AppearanceSettings() {
  const appearance = useContactsStore((s) => s.settings.appearance);
  const dock = useContactsStore((s) => s.settings.dock);
  const companyLogos = useContactsStore((s) => s.settings.companyLogos);
  const showToast = useContactsStore((s) => s.showToast);
  const updateSettings = useContactsStore((s) => s.updateSettings);
  const set = (patch: Partial<typeof appearance>) => void updateSettings({ appearance: { ...appearance, ...patch } });

  return (
    <div className="max-w-xl space-y-6 pt-2">
      <Row label="Theme" hint="Dark glass suits most wallpapers; light works on bright desktops.">
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set({ theme: t })}
              className={cn("rounded-lg border px-3 py-1.5 text-sm capitalize", appearance.theme === t && "border-primary bg-primary/10")}
            >
              {t}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Accent">
        <div className="flex gap-2">
          {ACCENTS.map((h) => (
            <button
              key={h}
              type="button"
              aria-label={`Accent hue ${h}`}
              onClick={() => set({ accentHue: h })}
              style={{ background: `hsl(${h} 85% 55%)` }}
              className={cn("h-7 w-7 rounded-full ring-offset-2 ring-offset-background", appearance.accentHue === h && "ring-2 ring-foreground")}
            />
          ))}
        </div>
      </Row>
      <Row label={`Panel opacity · ${Math.round(appearance.opacity * 100)}%`} hint="Lower is more see-through.">
        <Slider min={20} max={100} step={1} value={[Math.round(appearance.opacity * 100)]} onValueChange={([v]) => set({ opacity: v / 100 })} />
      </Row>
      <Row label={`Blur · ${appearance.blur}px`} hint="Softens anything showing through the panel.">
        <Slider min={0} max={40} step={1} value={[appearance.blur]} onValueChange={([v]) => set({ blur: v })} />
      </Row>
      <Row label="Density">
        <div className="flex gap-2">
          {(["comfortable", "compact"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => set({ density: d })}
              className={cn("rounded-lg border px-3 py-1.5 text-sm capitalize", appearance.density === d && "border-primary bg-primary/10")}
            >
              {d}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Company logos" hint="Contacts without a photo show their company's website logo, taken from their work email domain (or the Website field). Personal addresses like Gmail fall back to initials.">
        <div className="flex items-center gap-3">
          <Switch checked={companyLogos} onCheckedChange={(v) => void updateSettings({ companyLogos: v })} />
          <Button
            variant="outline"
            size="sm"
            disabled={!companyLogos}
            onClick={() => void window.contacts.refreshLogos(true).then((n) => showToast(n ? `Updated ${n} logos` : "Logos are up to date"))}
          >
            <RefreshCw /> Refresh logos
          </Button>
        </div>
      </Row>
      <Row label="Dock to screen edge" hint="Collapses the widget into a slim strip of avatars that stays above other windows. Click an avatar or the expand arrow to open it; click Collapse to tuck it away.">
        <div className="flex items-center gap-3">
          <Switch checked={dock.enabled} onCheckedChange={(v) => void updateSettings({ dock: { ...dock, enabled: v } })} />
          <div className="flex gap-2">
            {(["left", "right"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => void updateSettings({ dock: { ...dock, side } })}
                className={cn("rounded-lg border px-3 py-1.5 text-sm capitalize", dock.side === side && "border-primary bg-primary/10")}
              >
                {side}
              </button>
            ))}
          </div>
        </div>
      </Row>
      <Row label="System blur" hint="Lets the OS blur the real desktop behind the panel (Windows 11 acrylic, macOS vibrancy). Turn off if the panel renders black on your graphics driver; the widget then uses its own glass effect.">
        <Switch checked={appearance.acrylic} onCheckedChange={(v) => set({ acrylic: v })} />
      </Row>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-4">
      <div>
        <Label className="text-sm">{label}</Label>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}
