import { useEffect, useState } from "react";
import { Cloud, CloudCog, Contact2, Palette, PhoneCall, Settings as SettingsIcon, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs";
import { useContactsStore } from "@renderer/store/useContacts";
import { cn } from "@renderer/lib/utils";
import { ContactsEditor } from "./ContactsEditor";
import { ImportWizard } from "./ImportWizard";
import { DialerSettings } from "./DialerSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { GeneralSettings } from "./GeneralSettings";
import { M365Settings } from "./M365Settings";
import { SalesforceSettings } from "./SalesforceSettings";

const TABS = ["contacts", "import", "m365", "salesforce", "dialer", "appearance", "general"] as const;
type Tab = (typeof TABS)[number];

export function SettingsPage({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "contacts");
  const toast = useContactsStore((s) => s.toast);
  const version = useContactsStore((s) => s.version);

  useEffect(() => {
    if (TABS.includes(initialTab as Tab)) setTab(initialTab as Tab);
  }, [initialTab]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">QCF Contacts</h1>
          <p className="text-xs text-muted-foreground">Settings · v{version}</p>
        </div>
      </header>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-6 pt-3">
          <TabsList className="h-10 bg-transparent p-0">
            {[
              ["contacts", "Contacts", Contact2],
              ["import", "Import", Upload],
              ["m365", "Microsoft 365", Cloud],
              ["salesforce", "Salesforce", CloudCog],
              ["dialer", "Call & Text", PhoneCall],
              ["appearance", "Appearance", Palette],
              ["general", "General", SettingsIcon],
            ].map(([value, label, Icon]) => {
              const I = Icon as typeof Contact2;
              return (
                <TabsTrigger
                  key={value as string}
                  value={value as string}
                  className="gap-2 rounded-none border-b-2 border-transparent px-3 pb-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <I className="h-4 w-4" /> {label as string}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
          <TabsContent value="contacts"><ContactsEditor /></TabsContent>
          <TabsContent value="import"><ImportWizard onDone={() => setTab("contacts")} /></TabsContent>
          <TabsContent value="m365"><M365Settings /></TabsContent>
          <TabsContent value="salesforce"><SalesforceSettings /></TabsContent>
          <TabsContent value="dialer"><DialerSettings /></TabsContent>
          <TabsContent value="appearance"><AppearanceSettings /></TabsContent>
          <TabsContent value="general"><GeneralSettings /></TabsContent>
        </div>
      </Tabs>
      {toast ? (
        <div
          role="status"
          className={cn(
            "pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg animate-fade-up",
            toast.tone === "error" ? "border-destructive/40 bg-destructive text-destructive-foreground" : "bg-card text-foreground",
          )}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
