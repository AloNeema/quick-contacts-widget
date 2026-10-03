import { useState } from "react";
import { CloudCog, LogIn, LogOut, RefreshCw } from "lucide-react";
import { SALESFORCE_REDIRECT_URI } from "@shared/defaults";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import { Switch } from "@renderer/components/ui/switch";
import { useContactsStore } from "@renderer/store/useContacts";

export function SalesforceSettings() {
  const sf = useContactsStore((s) => s.settings.salesforce);
  const status = useContactsStore((s) => s.sf);
  const contacts = useContactsStore((s) => s.contacts);
  const updateSettings = useContactsStore((s) => s.updateSettings);
  const setContacts = useContactsStore((s) => s.setContacts);
  const showToast = useContactsStore((s) => s.showToast);
  const [consumerKey, setConsumerKey] = useState(sf.consumerKey);
  const [loginUrl, setLoginUrl] = useState(sf.loginUrl);
  const [busy, setBusy] = useState<"signin" | "sync" | null>(null);
  const linked = contacts.filter((c) => c.sf).length;
  const dirty = consumerKey.trim() !== sf.consumerKey || loginUrl.trim() !== sf.loginUrl;

  const save = () => {
    let url = loginUrl.trim() || "https://login.salesforce.com";
    if (!/^https:\/\//.test(url)) url = `https://${url}`;
    void updateSettings({ salesforce: { ...sf, consumerKey: consumerKey.trim(), loginUrl: url.replace(/\/$/, "") } }).then(() => {
      setLoginUrl(url.replace(/\/$/, ""));
      showToast("Saved");
    });
  };
  const signIn = async () => {
    setBusy("signin");
    try {
      const s = await window.contacts.sfSignIn();
      useContactsStore.setState({ sf: s });
      showToast(s.lastError ?? `Connected to ${s.instanceUrl?.replace(/^https:\/\//, "")}`, s.lastError ? "error" : "info");
    } finally {
      setBusy(null);
    }
  };
  const signOut = async () => {
    useContactsStore.setState({ sf: await window.contacts.sfSignOut() });
    showToast("Disconnected from Salesforce");
  };
  const sync = async () => {
    setBusy("sync");
    try {
      const r = await window.contacts.sfSync();
      useContactsStore.setState({ sf: r.status });
      setContacts(useContactsStore.getState().contacts);
      showToast(r.status.lastError ?? `Linked ${r.summary.linked}, ${r.summary.unmatched} not in Salesforce`, r.status.lastError ? "error" : "info");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 pt-2">
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <CloudCog className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Connected App</p>
        </div>
        <p className="text-xs text-muted-foreground">
          One-time setup in Salesforce <b>Setup › App Manager › New Connected App</b>: enable OAuth, set the callback URL to exactly <code>{SALESFORCE_REDIRECT_URI}</code>,
          select the scopes <i>Manage user data via APIs (api)</i>, <i>Perform requests at any time (refresh_token, offline_access)</i> and <i>Access unique identifiers (openid)</i>,
          tick <b>Require Proof Key for Code Exchange (PKCE)</b> and untick <b>Require Secret for Web Server Flow</b>. Paste the <b>Consumer Key</b> below. Read access to Contacts, Leads, Accounts and Opportunities comes from your own user permissions.
        </p>
        <div className="grid gap-3 md:grid-cols-[1fr_260px]">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Consumer Key</Label>
            <Input value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} placeholder="3MVG9…" className="font-mono text-xs" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Login URL</Label>
            <Input value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} placeholder="https://yourcompany.my.salesforce.com" />
          </div>
        </div>
        <Button size="sm" onClick={save} disabled={!dirty}>Save</Button>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{status.signedIn ? `Connected${status.username ? ` as ${status.username}` : ""}` : "Not connected"}</p>
            <p className="text-xs text-muted-foreground">
              {status.lastSyncAt ? `Last sync ${new Date(status.lastSyncAt).toLocaleString()} · ${linked} contacts linked` : linked ? `${linked} contacts linked` : "Connect, then sync to link contacts by email and show their open deals."}
            </p>
            {status.lastError ? <p className="mt-1 text-xs text-destructive">{status.lastError}</p> : null}
          </div>
          <div className="flex gap-2">
            {status.signedIn ? (
              <>
                <Button onClick={() => void sync()} disabled={busy !== null}><RefreshCw className={busy === "sync" ? "animate-spin" : ""} /> {busy === "sync" ? "Syncing…" : "Sync now"}</Button>
                <Button variant="outline" onClick={() => void signOut()} disabled={busy !== null}><LogOut /> Disconnect</Button>
              </>
            ) : (
              <Button onClick={() => void signIn()} disabled={!sf.consumerKey || busy !== null}><LogIn /> {busy === "signin" ? "Waiting for browser…" : "Connect Salesforce"}</Button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <Label className="text-sm">Show top open deal under the name</Label>
            <p className="mt-1 text-xs text-muted-foreground">Stage and amount of the nearest-closing open opportunity on the person's account, refreshed on sync and whenever you open their row.</p>
          </div>
          <Switch checked={sf.showDeals} onCheckedChange={(v) => void updateSettings({ salesforce: { ...sf, showDeals: v } })} />
        </div>
        <p className="text-xs text-muted-foreground">Tokens are stored encrypted on this PC. The widget only reads; it never writes to Salesforce.</p>
      </section>
    </div>
  );
}
