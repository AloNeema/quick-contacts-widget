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
];

export function DialerSettings() {
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
        {OPTIONS.map((o) => (
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
          <p>Call opens <code className="text-foreground">{previewCall || "—"}</code></p>
          <p>Text opens <code className="text-foreground">{previewSms || "—"}</code></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} className="w-44" />
          <Button variant="outline" size="sm" onClick={() => void test("call")}><Phone /> Test call</Button>
          <Button variant="outline" size="sm" onClick={() => void test("sms")}><MessageSquare /> Test text</Button>
        </div>
        <p className="text-xs text-muted-foreground">Email always opens your default mail app with a mailto: link.</p>
      </section>
    </div>
  );
}
