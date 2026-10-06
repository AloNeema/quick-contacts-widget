import { useEffect, useState } from "react";
import { Download, Keyboard, RefreshCw } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import { DEFAULT_HOTKEY } from "@shared/defaults";
import { Switch } from "@renderer/components/ui/switch";
import { useContactsStore } from "@renderer/store/useContacts";
import { BackupSettings } from "./BackupSettings";

export function GeneralSettings() {
  const settings = useContactsStore((s) => s.settings);
  const updateSettings = useContactsStore((s) => s.updateSettings);
  const contacts = useContactsStore((s) => s.contacts);
  const showToast = useContactsStore((s) => s.showToast);
  const update = useContactsStore((s) => s.update);
  const platform = useContactsStore((s) => s.platform);
  const previewBuild = useContactsStore((s) => s.version.includes("-"));
  const pretty = (acc: string) => acc.replace("CommandOrControl", platform === "darwin" ? "⌘" : "Ctrl");
  const [token, setToken] = useState("");
  const [hotkey, setHotkey] = useState(settings.hotkey);
  const [recording, setRecording] = useState(false);
  useEffect(() => setHotkey(settings.hotkey), [settings.hotkey]);

  const saveHotkey = async (value: string) => {
    try {
      await updateSettings({ hotkey: value });
      showToast(value ? `Hotkey set to ${pretty(value)}` : "Hotkey disabled");
    } catch (err) {
      setHotkey(settings.hotkey);
      showToast(err instanceof Error ? err.message : "Could not register that hotkey", "error");
    }
  };
  const record = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key === " " ? "Space" : e.key;
    if (parts.length === 0 && !/^F\d+$/.test(key)) {
      showToast("Use at least one modifier (Ctrl, Alt or Shift) or a function key", "error");
      return;
    }
    parts.push(key);
    const acc = parts.join("+");
    setHotkey(acc);
    setRecording(false);
    void saveHotkey(acc);
  };

  return (
    <div className="max-w-xl space-y-6 pt-2">
      <BackupSettings />
      <Toggle
        label="Keep widget on top"
        hint="Floats above other windows. Off by default so it behaves like a desktop gadget."
        checked={settings.alwaysOnTop}
        onChange={(v) => void updateSettings({ alwaysOnTop: v })}
      />
      <Toggle
        label="Start with Windows"
        hint={previewBuild ? "Preview builds leave the regular app's startup setting unchanged." : "Launches hidden in the tray when you sign in. Applies to packaged stable builds only."}
        checked={!previewBuild && settings.launchAtLogin}
        disabled={previewBuild}
        onChange={(v) => void updateSettings({ launchAtLogin: v })}
      />
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm">Summon hotkey</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Press it anywhere in Windows to pop the widget up with the search box focused. Type a name, then <kbd>Enter</kbd> calls the top match,
          <kbd> Alt+Enter</kbd> texts, <kbd>Shift+Enter</kbd> emails, <kbd>Esc</kbd> hides. With Talkdesk, Enter and Alt+Enter copy the preferred number.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            readOnly
            value={recording ? "Press keys…" : hotkey ? pretty(hotkey) : "Disabled"}
            onFocus={() => setRecording(true)}
            onBlur={() => setRecording(false)}
            onKeyDown={record}
            className={`w-64 font-mono text-sm ${recording ? "ring-2 ring-primary" : ""}`}
          />
          <Button variant="outline" size="sm" onClick={() => void saveHotkey(DEFAULT_HOTKEY)} disabled={hotkey === DEFAULT_HOTKEY}>Reset</Button>
          <Button variant="ghost" size="sm" onClick={() => void saveHotkey("")} disabled={!hotkey}>Disable</Button>
        </div>
      </section>
      <section className="space-y-3 rounded-xl border p-4">
        <Toggle
          label="Update automatically"
          hint="Checks GitHub Releases every six hours, downloads in the background and installs when you quit."
          checked={settings.autoUpdate}
          onChange={(v) => void updateSettings({ autoUpdate: v })}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            v{update.currentVersion || settings.schemaVersion}
            {update.state === "checking" && " · checking…"}
            {update.state === "downloading" && ` · downloading ${update.version} (${update.percent ?? 0}%)`}
            {update.state === "ready" && ` · ${update.version} ready to install`}
            {update.state === "up-to-date" && " · up to date"}
            {update.state === "error" && ` · ${update.error}`}
            {update.state === "disabled" && ` · ${update.error}`}
          </span>
          <span className="flex-1" />
          {update.state === "ready" ? (
            <Button size="sm" onClick={() => void window.contacts.installUpdate()}><Download /> Restart to update</Button>
          ) : (
            <Button variant="outline" size="sm" disabled={update.state === "checking" || update.state === "disabled"} onClick={() => void window.contacts.checkForUpdates()}>
              <RefreshCw className={update.state === "checking" ? "animate-spin" : ""} /> Check now
            </Button>
          )}
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Private repository token</summary>
          <p className="mt-2">
            The releases live in a private GitHub repository, so the updater needs a fine-grained personal access token with read-only <i>Contents</i> permission on it.
            It is stored encrypted on this PC. {update.hasToken ? "A token is saved." : "No token saved yet."}
          </p>
          <div className="mt-2 flex gap-2">
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" className="font-mono text-xs" />
            <Button size="sm" variant="secondary" disabled={!token.trim()} onClick={() => void window.contacts.setUpdateToken(token).then(() => { setToken(""); showToast("Token saved"); })}>Save</Button>
            {update.hasToken ? <Button size="sm" variant="ghost" onClick={() => void window.contacts.setUpdateToken("").then(() => showToast("Token removed"))}>Remove</Button> : null}
          </div>
        </details>
      </section>
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

function Toggle({ label, hint, checked, onChange, disabled = false }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <Label className="text-sm">{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
