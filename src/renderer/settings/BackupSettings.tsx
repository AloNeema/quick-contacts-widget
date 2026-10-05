import { useEffect, useState } from "react";
import { Button } from "@renderer/components/ui/button";
import { useContactsStore } from "@renderer/store/useContacts";

export function BackupSettings() {
  const [status, setStatus] = useState<{ preview: boolean; error?: string }>({ preview: false });
  const [busy, setBusy] = useState(false);
  const showToast = useContactsStore(s => s.showToast);
  useEffect(() => { void window.contacts.backupStatus().then(setStatus).catch(() => setStatus({ preview: false, error: "Could not check automatic backup status." })); }, []);
  const run = async (action: "save" | "restore" | "regular" | "folder") => {
    setBusy(true);
    try {
      const result = await window.contacts.backupAction(action);
      if (result.message) showToast(result.message);
    } catch (error) { showToast(error instanceof Error ? error.message : "Backup could not be completed", "error"); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border p-4">
    <p className="text-sm font-medium">Backup & restore</p>
    <p className="text-xs text-muted-foreground">Save contacts, notes, order, starred numbers, photos and settings in one file, including your Microsoft app ID/tenant and Salesforce consumer key. Keep this file private. Sign-ins and the update token are not included; the Clients list refreshes after sign-in.</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={() => void run("save")}>Save backup</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("restore")}>Restore backup</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run("folder")}>Automatic backups</Button>
    </div>
    <p className="text-xs text-muted-foreground">Updates keep your saved setup. A backup is also made on the first launch each day or version; the latest ten are kept. Restore replaces this app's setup after confirmation and restarts it.</p>
    {status.error ? <p role="alert" className="text-xs text-destructive">Automatic backup failed: {status.error}. Use Save backup to choose another location.</p> : null}
    {status.preview ? <div className="space-y-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">You are using a preview with its own saved setup. You can copy the regular app's contacts and settings here, then sign in again. Quit the regular app first so its latest changes are saved.</p>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("regular")}>Copy setup from regular app</Button>
    </div> : null}
  </section>;
}
