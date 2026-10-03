import type { Appearance, DialerProvider, M365Settings, SalesforceSettings, Settings } from "./types";

export const DIALER_PRESETS: Record<Exclude<DialerProvider["id"], "custom">, DialerProvider> = {
  ringcentral: {
    id: "ringcentral",
    label: "RingCentral app",
    callTemplate: "rcapp://r/call?number={e164}",
    smsTemplate: "rcapp://r/sms?type=new&number={e164}",
  },
  phonelink: {
    id: "phonelink",
    label: "Phone Link (Windows)",
    callTemplate: "tel:{e164}",
    smsTemplate: "sms:{e164}",
  },
  system: {
    id: "system",
    label: "Windows default app",
    callTemplate: "tel:{e164}",
    smsTemplate: "sms:{e164}",
  },
};

export const CUSTOM_DIALER_TEMPLATE: DialerProvider = {
  id: "custom",
  label: "Custom",
  callTemplate: "tel:{e164}",
  smsTemplate: "sms:{e164}",
};

export const DEFAULT_APPEARANCE: Appearance = {
  opacity: 0.38,
  blur: 28,
  accentHue: 212,
  theme: "dark",
  acrylic: true,
  density: "comfortable",
};

export const DEFAULT_HOTKEY = "CommandOrControl+Shift+C";

export const DEFAULT_M365: M365Settings = {
  clientId: "",
  tenant: "organizations",
  presence: true,
  includeOutlookContacts: true,
};

/** Delegated Graph scopes the sync needs. Presence.Read.All is delegated and does not need admin consent. */
export const M365_SCOPES = ["User.Read", "User.ReadBasic.All", "Contacts.Read", "People.Read", "Presence.Read.All", "Mail.Read", "Calendars.Read"];

export const DEFAULT_SALESFORCE: SalesforceSettings = { consumerKey: "", loginUrl: "https://login.salesforce.com", showDeals: true };
/** Fixed loopback redirect; register exactly this URL as the Connected App callback. */
export const SALESFORCE_REDIRECT_URI = "http://localhost:48217/callback";
export const SALESFORCE_SCOPES = "api refresh_token openid";

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  dialer: DIALER_PRESETS.ringcentral,
  hotkey: DEFAULT_HOTKEY,
  m365: DEFAULT_M365,
  autoUpdate: true,
  salesforce: DEFAULT_SALESFORCE,
  dock: { enabled: false, side: "right" },
  alwaysOnTop: false,
  launchAtLogin: false,
  appearance: DEFAULT_APPEARANCE,
};

export const WIDGET_DEFAULT_SIZE = { width: 340, height: 520 };
export const WIDGET_MIN_SIZE = { width: 280, height: 220 };
export const DOCK_STRIP_WIDTH = 76;
