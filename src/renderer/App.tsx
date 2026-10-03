import { useEffect, useState } from "react";
import { TooltipProvider } from "@renderer/components/ui/tooltip";
import { useContactsStore } from "@renderer/store/useContacts";
import { WidgetPanel } from "@renderer/widget/WidgetPanel";
import { SettingsPage } from "@renderer/settings/SettingsPage";

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, "") || "/widget");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.replace(/^#/, "") || "/widget");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const route = useHashRoute();
  const hydrate = useContactsStore((s) => s.hydrate);
  const appearance = useContactsStore((s) => s.settings.appearance);
  const ready = useContactsStore((s) => s.ready);
  const platform = useContactsStore((s) => s.platform);
  // Acrylic is a Windows 11 material; elsewhere the CSS glass does the work.
  const acrylic = appearance.acrylic && (platform === "win32" || platform === "darwin");

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = appearance.theme;
    root.style.setProperty("--accent-hue", String(appearance.accentHue));
    root.style.setProperty("--panel-opacity", String(appearance.opacity));
    root.style.setProperty("--panel-blur", `${appearance.blur}px`);
    document.body.dataset.acrylic = String(acrylic);
  }, [appearance, acrylic]);

  const dock = useContactsStore((s) => s.settings.dock);
  useEffect(() => {
    document.body.dataset.dock = dock.enabled ? dock.side : "";
  }, [dock]);

  const isSettings = route.startsWith("/settings");
  useEffect(() => {
    document.body.dataset.surface = isSettings ? "settings" : "widget";
  }, [isSettings]);

  if (!ready) return null;
  return (
    <TooltipProvider delayDuration={400}>
      {isSettings ? <SettingsPage initialTab={route.split("/")[2]} /> : <WidgetPanel />}
    </TooltipProvider>
  );
}
