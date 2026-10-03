import { useState } from "react";
import { Cloud, LogIn, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import { Switch } from "@renderer/components/ui/switch";
import { useContactsStore } from "@renderer/store/useContacts";

export function M365Settings() {
  const m365 = useContactsStore((s) => s.settings.m365);
  const status = useContactsStore((s) => s.m365);
  const contacts = useContactsStore((s) => s.contacts);
  const updateSettings = useContactsStore((s) => s.updateSettings);
  const setContacts = useContactsStore((s) => s.setContacts);
  const showToast = useContactsStore((s) => s.showToast);
  const [clientId, setClientId] = useState(m365.clientId);
  const [tenant, setTenant] = useState(m365.tenant);
  const [busy, setBusy] = useState<"signin" | "sync" | null>(null);

  const synced = contacts.filter((c) => c.m365).length;
  const dirty = clientId.trim() !== m365.clientId || tenant.trim() !== m365.tenant;

  const saveApp = () => void updateSettings({ m365: { ...m365, clientId: clientId.trim(), tenant: tenant.trim() || "organizations" } }).then(() => showToast("Saved"));
  const signIn = async () => {
    setBusy("signin");
    try {
      const s = await window.contacts.m365SignIn();
      useContactsStore.setState({ m365: s });
      if (s.lastError) showToast(s.lastError, "error");
      else showToast(`Signed in as ${s.account?.username ?? "Microsoft account"}`);
    } finally {
      setBusy(null);
    }
  };
  const signOut = async () => {
    const s = await window.contacts.m365SignOut();
    useContactsStore.setState({ m365: s });
    showToast("Signed out");
  };
  const sync = async () => {
    setBusy("sync");
    try {
      const r = await window.contacts.m365Sync();
      useContactsStore.setState({ m365: r.status });
      setContacts(useContactsStore.getState().contacts);
      if (r.status.lastError) showToast(r.status.lastError, "error");
      else showToast(`Matched ${r.summary.matched}, ${r.summary.photos} photos, ${r.summary.unmatched} not found`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 pt-2">
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Azure app registration</p>
        </div>
        <p className="text-xs text-muted-foreground">
          One-time setup in the Azure portal: <b>Microsoft Entra ID › App registrations › New registration</b>. Name it "QCF Contacts", choose
          <i> Accounts in this organizational directory only</i>, and under <b>Authentication › Add a platform › Mobile and desktop applications</b>
          tick <code>http://localhost</code>. Enable <i>Allow public client flows</i>. Then paste the <b>Application (client) ID</b> here. Permissions
          (User.Read, User.ReadBasic.All, Contacts.Read, People.Read, Presence.Read.All) are requested at sign-in; none need admin consent.
        </p>
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Application (client) ID</Label>
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="font-mono text-xs" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Tenant</Label>
            <Input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="organizations or yourcompany.com" />
          </div>
        </div>
        <Button size="sm" onClick={saveApp} disabled={!dirty}>Save</Button>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{status.signedIn ? `Signed in as ${status.account?.name ?? status.account?.username}` : "Not signed in"}</p>
            <p className="text-xs text-muted-foreground">
              {status.lastSyncAt ? `Last sync ${new Date(status.lastSyncAt).toLocaleString()} · ${synced} contacts linked` : synced ? `${synced} contacts linked` : "Sign in, then sync to pull photos and titles for everyone with a work email."}
            </p>
            {status.lastError ? <p className="mt-1 text-xs text-destructive">{status.lastError}</p> : null}
          </div>
          <div className="flex gap-2">
            {status.signedIn ? (
              <>
                <Button onClick={() => void sync()} disabled={busy !== null}>
                  <RefreshCw className={busy === "sync" ? "animate-spin" : ""} /> {busy === "sync" ? "Syncing…" : "Sync now"}
                </Button>
                <Button variant="outline" onClick={() => void signOut()} disabled={busy !== null}><LogOut /> Sign out</Button>
              </>
            ) : (
              <Button onClick={() => void signIn()} disabled={!m365.clientId || busy !== null}>
                <LogIn /> {busy === "signin" ? "Waiting for browser…" : "Sign in with Microsoft"}
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <Toggle label="Show Teams presence" hint="Green / red / amber dot on people in your organization, refreshed every 45 seconds while signed in." checked={m365.presence} onChange={(v) => void updateSettings({ m365: { ...m365, presence: v } })} />
        <Toggle label="Include Outlook contacts" hint="Also match people saved in your personal Outlook contacts, not just the company directory." checked={m365.includeOutlookContacts} onChange={(v) => void updateSettings({ m365: { ...m365, includeOutlookContacts: v } })} />
        <p className="text-xs text-muted-foreground">Sync never replaces a photo you set yourself. Tokens are stored encrypted on this PC only.</p>
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
