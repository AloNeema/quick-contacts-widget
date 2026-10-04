import { useState } from "react";
import { Cloud, Inbox, LogIn, LogOut, RefreshCw } from "lucide-react";
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
  const cl = useContactsStore((s) => s.settings.clients);
  const clients = useContactsStore((s) => s.clients);
  const sfSignedIn = useContactsStore((s) => s.sf.signedIn);
  const [domains, setDomains] = useState(cl.internalDomains.join(", "));
  const [lenders, setLenders] = useState(cl.lenderDomains.join(", "));
  const setCl = (patch: Partial<typeof cl>) => void updateSettings({ clients: { ...cl, ...patch } });
  const splitDomains = (v: string) => [...new Set(v.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]).filter(Boolean))];
  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

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
          (User.Read, User.ReadBasic.All, Contacts.Read, People.Read, Presence.Read.All, Mail.Read, Calendars.Read) are requested at sign-in; none need admin consent.
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

      <section className="space-y-4 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Clients tab</p>
        </div>
        <Toggle
          label="Find clients in my inbox"
          hint="Every 15 minutes, reads Inbox and Sent Items and lists people outside the company who look like clients, newest first. The badge counts new clients since you last opened the tab."
          checked={cl.enabled}
          onChange={(v) => setCl({ enabled: v })}
        />
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Who counts as a client</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Never: coworkers, your lender list, no-reply senders, newsletters, calendar replies.</li>
            <li>Always: anyone in Salesforce as a Contact or Lead{cl.useSalesforce ? (sfSignedIn ? "" : " (connect Salesforce to use this)") : " (off)"}.</li>
            <li>Otherwise when two or more of these add up: they replied to your email, sent attachments, emailed more than once, or you've gone back and forth.</li>
          </ul>
        </div>
        <Toggle label="Use Salesforce" hint="Anyone whose email is a Salesforce Contact or open Lead goes straight on the list." checked={cl.useSalesforce} onChange={(v) => setCl({ useSalesforce: v })} />
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Lender list (never clients)</Label>
          <textarea
            value={lenders}
            onChange={(e) => setLenders(e.target.value)}
            onBlur={() => setCl({ lenderDomains: splitDomains(lenders) })}
            rows={3}
            placeholder="ondeck.com, kapitus.com, fundbox.com…"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Domains of contacts in a "Lenders" group are excluded automatically too.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Company domains (coworkers)</Label>
            <Input value={domains} onChange={(e) => setDomains(e.target.value)} onBlur={() => setCl({ internalDomains: splitDomains(domains) })} placeholder="Empty = your sign-in domain" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Look back (days)</Label>
            <Input type="number" min={7} max={180} defaultValue={cl.lookbackDays} onBlur={(e) => setCl({ lookbackDays: num(e.target.value, 7, 180, cl.lookbackDays) })} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex-1">
            {clients.lastScanAt ? `Last checked ${new Date(clients.lastScanAt).toLocaleString()} · ${clients.items.length} clients, ${clients.hiddenCount} removed` : "Not checked yet"}
          </span>
          <Button variant="outline" size="sm" disabled={!cl.enabled || !status.signedIn || clients.scanning} onClick={() => void window.contacts.scanClients()}>
            <RefreshCw className={clients.scanning ? "animate-spin" : ""} /> Check inbox now
          </Button>
          <Button variant="ghost" size="sm" disabled={!clients.hiddenCount} onClick={() => void window.contacts.restoreHiddenClients().then((n) => showToast(n ? `Restored ${n} removed people` : "Nothing to restore"))}>
            Restore removed
          </Button>
        </div>
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
