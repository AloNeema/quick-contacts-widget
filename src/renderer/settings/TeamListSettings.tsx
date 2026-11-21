import { useEffect, useState } from "react";
import { Download, RefreshCw, ShieldCheck, Users } from "lucide-react";
import type { TeamListStatus } from "@shared/types";
import { isOneDriveShareUrl } from "@shared/teamList";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import { useContactsStore } from "@renderer/store/useContacts";

/** Settings › Microsoft 365: the shared team contact list kept in OneDrive. */
export function TeamListSettings() {
  const m365 = useContactsStore((s) => s.settings.m365);
  const signedIn = useContactsStore((s) => s.m365.signedIn);
  const contacts = useContactsStore((s) => s.contacts);
  const updateSettings = useContactsStore((s) => s.updateSettings);
  const showToast = useContactsStore((s) => s.showToast);
  const [link, setLink] = useState(m365.teamListUrl ?? "");
  const [status, setStatus] = useState<TeamListStatus>({ configured: false, syncing: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.contacts.teamStatus().then(setStatus);
    return window.contacts.onTeamStatusChanged(setStatus);
  }, []);
  useEffect(() => setLink(m365.teamListUrl ?? ""), [m365.teamListUrl]);

  const trimmed = link.trim();
  const invalid = trimmed !== "" && !isOneDriveShareUrl(trimmed);
  const dirty = trimmed !== (m365.teamListUrl ?? "");
  const fromTeam = contacts.filter((c) => c.team).length;

  const save = () => {
    if (invalid) return;
    void updateSettings({ m365: { ...m365, teamListUrl: trimmed || undefined } }).then(() =>
      showToast(trimmed ? "Team list link saved." : "Team list removed. Contacts it added stay as your own."),
    );
  };
  const syncNow = async () => {
    setBusy(true);
    try {
      const s = await window.contacts.teamSync();
      setStatus(s);
      if (s.error) showToast(s.error, "error");
      else showToast(`Team list up to date · ${s.count ?? 0} contacts`);
    } finally {
      setBusy(false);
    }
  };
  const allow = async () => {
    setBusy(true);
    try {
      const s = await window.contacts.m365SignIn();
      useContactsStore.setState({ m365: s });
      if (s.lastError) showToast(s.lastError, "error");
      else await syncNow();
    } finally {
      setBusy(false);
    }
  };
  const exportExcel = async () => {
    const r = await window.contacts.exportContacts("xlsx");
    if (r.ok) showToast(`Saved ${r.count} contact${r.count === 1 ? "" : "s"} to ${r.fileName}. Put it in OneDrive and share it with the team.`);
    else if (!("canceled" in r)) showToast(r.error, "error");
  };

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">Team contact list</p>
      </div>
      <p className="text-xs text-muted-foreground">
        One Excel file in OneDrive that everyone's widget reads. Add or change someone in the file and every teammate gets it within 30 minutes. Your own pins,
        notes and photos stay yours; people the list added leave again when they're removed from the file.
      </p>
      <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
        <li>
          Whoever keeps the list: <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => void exportExcel()}>export your contacts to Excel</button>,
          save the file in OneDrive, then <b>Share › Copy link</b> with <i>People in your organization</i> (or the team) able to view.
        </li>
        <li>Everyone: paste that link below and save. The first time, Microsoft asks once to let the widget read the shared file.</li>
      </ol>
      <div>
        <Label htmlFor="team-list-link" className="mb-1.5 block text-xs text-muted-foreground">
          OneDrive share link
        </Label>
        <div className="flex gap-2">
          <Input id="team-list-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://yourcompany-my.sharepoint.com/:x:/g/personal/…" className="font-mono text-xs" />
          <Button size="sm" onClick={save} disabled={!dirty || invalid}>
            Save
          </Button>
        </div>
        {invalid ? <p className="mt-1 text-xs text-destructive">Paste a OneDrive or SharePoint share link (it starts with https:// and ends in sharepoint.com or 1drv.ms).</p> : null}
      </div>
      {m365.teamListUrl ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 text-muted-foreground">
            {!signedIn
              ? "Sign in with Microsoft above to read the team list."
              : status.syncing
                ? "Reading the team list…"
                : status.lastSyncAt
                  ? `${status.fileName ?? "Team list"} · checked ${new Date(status.lastSyncAt).toLocaleString()} · ${status.count ?? fromTeam} contacts from the list`
                  : "Not read yet."}
          </span>
          {status.needsPermission ? (
            <Button size="sm" onClick={() => void allow()} disabled={busy || !signedIn}>
              <ShieldCheck /> Allow access
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => void syncNow()} disabled={busy || !signedIn || status.syncing}>
              <RefreshCw className={busy || status.syncing ? "animate-spin" : ""} /> Check now
            </Button>
          )}
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => void exportExcel()} disabled={!contacts.length}>
          <Download /> Export contacts to Excel
        </Button>
      )}
      {status.error && m365.teamListUrl && signedIn ? <p className="text-xs text-destructive">{status.error}</p> : null}
    </section>
  );
}
