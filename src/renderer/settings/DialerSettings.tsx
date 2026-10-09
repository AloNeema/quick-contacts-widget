import { useState } from "react";
import { Phone, MessageSquare } from "lucide-react";
import type { DialerProvider, DialerProviderId } from "@shared/types";
import { CUSTOM_DIALER_TEMPLATE, DIALER_PRESETS } from "@shared/defaults";
import { buildDialUri, textCopiesNumber } from "@shared/dialer";
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
  { id: "talkdeskApp", title: "Talkdesk app", body: "Call opens Talkdesk (set it as the default app for TEL links). Talkdesk has no link for texts, so Text copies the number to paste into a new Talkdesk SMS." },
  { id: "talkdesk", title: "Talkdesk (copy only)", body: "Copy your starred calling or texting number, then paste it into Talkdesk." },
];

const MAC_OPTIONS: typeof OPTIONS = [
  OPTIONS[0],
  { id: "system", title: "FaceTime & Messages", body: "Call opens FaceTime (which can dial through your iPhone), Text opens Messages. Uses the standard tel: and sms: links." },
  OPTIONS[3],
  OPTIONS[4],
  OPTIONS[5],
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
    if (!textCopiesNumber(dialer.id)) previewSms = buildDialUri(dialer, "sms", "+15551234567");
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
          <p className="font-medium">Copy, then paste into Talkdesk</p>
          <p className="text-xs text-muted-foreground">Copy for call uses your starred calling number. Copy for text uses your starred texting number. Paste into the Talkdesk dialer or SMS recipient field.</p>
          <p className="text-xs text-muted-foreground">Copying does not place a call, send a text, or mark the contact as reached.</p>
        </section>
      ) : null}

      {dialer.id === "talkdeskApp" ? (
        <section className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Call opens Talkdesk, Text copies the number</p>
          <p className="text-xs text-muted-foreground">Call uses your starred calling number and opens it in Talkdesk through your computer's default calling app. If Call opens a different app, choose Talkdesk for TEL links in Windows Settings › Apps › Default apps.</p>
          <p className="text-xs text-muted-foreground">Copy for text copies your starred texting number. In Talkdesk, start a new SMS and paste it as the recipient. Copying never sends a message.</p>
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
          {dialer.id === "talkdesk" ? <p>Copy a test number, then paste it into Talkdesk.</p> : <>
            <p>Call opens <code className="text-foreground">{previewCall || "—"}</code></p>
            <p>{textCopiesNumber(dialer.id) ? "Text copies the number for Talkdesk" : <>Text opens <code className="text-foreground">{previewSms || "—"}</code></>}</p>
          </>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} className="w-44" />
          <Button variant="outline" size="sm" onClick={() => void test("call")}><Phone /> {dialer.id === "talkdesk" ? "Copy for call" : "Test call"}</Button>
          <Button variant="outline" size="sm" onClick={() => void test("sms")}><MessageSquare /> {textCopiesNumber(dialer.id) ? "Copy for text" : "Test text"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Email always opens your default mail app with a mailto: link.</p>
      </section>
    </div>
  );
}
