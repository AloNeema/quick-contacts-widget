import { Label } from "@renderer/components/ui/label";
import { Switch } from "@renderer/components/ui/switch";
import { useContactsStore } from "@renderer/store/useContacts";

export function GeneralSettings() {
  const settings = useContactsStore((s) => s.settings);
  const updateSettings = useContactsStore((s) => s.updateSettings);
  const contacts = useContactsStore((s) => s.contacts);

  return (
    <div className="max-w-xl space-y-6 pt-2">
      <Toggle
        label="Keep widget on top"
        hint="Floats above other windows. Off by default so it behaves like a desktop gadget."
        checked={settings.alwaysOnTop}
        onChange={(v) => void updateSettings({ alwaysOnTop: v })}
      />
      <Toggle
        label="Start with Windows"
        hint="Launches hidden in the tray when you sign in. Applies to the installed app, not a dev build."
        checked={settings.launchAtLogin}
        onChange={(v) => void updateSettings({ launchAtLogin: v })}
      />
      <section className="rounded-xl border p-4 text-sm">
        <p className="font-medium">Tips</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Drag the widget by its title bar; resize from the dotted corner.</li>
          <li>Closing the widget hides it. Click the tray icon to bring it back, or right-click for Quit.</li>
          <li>Hover a contact to reveal Call, Text and Email. Pinned contacts stay at the top.</li>
          <li>Your data lives only on this PC ({contacts.length} contacts). Nothing is sent anywhere.</li>
        </ul>
      </section>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <Label className="text-sm">{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
