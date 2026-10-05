import { useState } from "react";
import { Phone, MessageSquare } from "lucide-react";
import type { DialerProvider, DialerProviderId } from "@shared/types";
import { CUSTOM_DIALER_TEMPLATE, DIALER_PRESETS } from "@shared/defaults";
import { buildDialUri } from "@shared/dialer";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import { useContactsStore } from "@renderer/store/useContacts";
import { cn } from "@renderer/lib/utils";

const OPTIONS: { id: DialerProviderId; title: string; body: string }[] = [
  { id: "ringcentral", title: "RingCentral app", body: "Call and Text open straight in the RingCentral desktop app (rcapp:// links). RingCentral must be installed and signed in." },
  { id: "phonelink", title: "Phone Link", body: "Call and Text go to your paired phone through Windows Phone Link. In Windows Settings › Apps › Default apps, set Phone Link as the app for TEL and SMS links." },
  { id: "system", title: "Windows default", body: "Uses whatever app Windows has for tel: and sms: links (Teams, Zoom Phone, Skype, …)." },
  { id: "custom", title: "Custom", body: "Your own link templates, for a softphone that isn't listed." },
  { id: "talkdesk", title: "Talkdesk pilot", body: "Call opens a number in Chrome for your Talkdesk extension. Text copies the number for Talkdesk SMS." },
];

const MAC_OPTIONS: typeof OPTIONS = [
  OPTIONS[0],
  { id: "system", title: "FaceTime & Messages", body: "Call opens FaceTime (which can dial through your iPhone), Text opens Messages. Uses the standard tel: and sms: links." },
  OPTIONS[3],
  OPTIONS[4],
];

export function DialerSettings() {
  const platform = useContactsStore((s) => s.platform);
  const options = platform === "darwin" ? MAC_OPTIONS : OPTIONS;
  const dialer = useContactsStore((s) => s.settings.dialer);
  const updateSettings = useContactsStore((s) => s.updateSettings);
  const showToast = useContactsStore((s) => s.showToast);
  const [custom, setCustom] = useState<DialerProvider>(dialer.id === "custom" ? dialer : CUSTOM_DIALER_TEMPLATE);
  const [testNumber, setTestNumber] = useState("+15551234567");

  const choose = (id: DialerProviderId) => {
    const next = id === "custom" ? { ...custom, id: "custom" as const, label: "Custom" } : DIALER_PRESETS[id];
    void updateSettings({ dialer: next });
  };
  const saveCustom = () => {
    try {
      buildDialUri(custom, "call", "+15551234567");
      buildDialUri(custom, "sms", "+15551234567");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Invalid template", "error");
      return;
    }
    void updateSettings({ dialer: { ...custom, id: "custom", label: "Custom" } });
    showToast("Custom dialer saved");
  };
  const test = async (action: "call" | "sms") => {
    const r = await window.contacts.dial({ action, phone: testNumber.trim() });
    if (!r.ok) showToast(r.error, "error");
    else if (r.message) showToast(r.message);
  };

  let previewCall = "";
  let previewSms = "";
  try {
    previewCall = buildDialUri(dialer, "call", "+15551234567");
    previewSms = buildDialUri(dialer, "sms", "+15551234567");
  } catch {
    /* shown as blank */
  }

  return (
    <div className="space-y-6 pt-2">
      <section className="grid gap-3 md:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => choose(o.id)}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors hover:bg-accent/40",
              dialer.id === o.id ? "border-primary ring-2 ring-primary/30" : "",
            )}
          >
            <p className="text-sm font-semibold">{o.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{o.body}</p>
          </button>
        ))}
      </section>

      {dialer.id === "talkdesk" ? (
        <section className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Use your company Talkdesk extension</p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Keep Workspace Desktop running and signed in.</li>
            <li>In the Chrome profile with your Talkdesk extension, choose “Callbar (Electron) / Workspace” in its options.</li>
            <li>Click Call here, then use the Talkdesk extension on the calling page. If needed, select the number and right-click to find Talkdesk’s Call option.</li>
          </ol>
          <p className="text-xs text-muted-foreground">Copy for text uses your starred texting number. Paste it into Talkdesk SMS and compose there. This pilot does not send texts or mark contacts as reached.</p>
          <p className="text-xs text-muted-foreground">Finish any active call before using the calling page. Company Chrome permissions may need IT setup for the local page.</p>
        </section>
      ) : null}

      {dialer.id === "custom" ? (
        <section className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-medium">Custom link templates</p>
          <p className="text-xs text-muted-foreground">
            Placeholders: <code>{"{e164}"}</code> → +15551234567, <code>{"{digits}"}</code> → 15551234567, <code>{"{national}"}</code> → 5551234567.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Call</Label>
              <Input value={custom.callTemplate} onChange={(e) => setCustom({ ...custom, callTemplate: e.target.value })} placeholder="tel:{e164}" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Text</Label>
              <Input value={custom.smsTemplate} onChange={(e) => setCustom({ ...custom, smsTemplate: e.target.value })} placeholder="sms:{e164}" />
            </div>
          </div>
          <Button size="sm" onClick={saveCustom}>Save templates</Button>
        </section>
      ) : null}

      <section className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Try it</p>
        <div className="grid gap-1 text-xs text-muted-foreground">
          {dialer.id === "talkdesk" ? <p>Try the calling page or copy a number. The extension completes calling in Talkdesk.</p> : <>
            <p>Call opens <code className="text-foreground">{previewCall || "—"}</code></p>
            <p>Text opens <code className="text-foreground">{previewSms || "—"}</code></p>
          </>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} className="w-44" />
          <Button variant="outline" size="sm" onClick={() => void test("call")}><Phone /> {dialer.id === "talkdesk" ? "Open calling page" : "Test call"}</Button>
          <Button variant="outline" size="sm" onClick={() => void test("sms")}><MessageSquare /> {dialer.id === "talkdesk" ? "Copy for text" : "Test text"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Email always opens your default mail app with a mailto: link.</p>
      </section>
    </div>
  );
}
