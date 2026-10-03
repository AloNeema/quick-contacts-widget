import type { Appearance, DialerProvider, Settings } from "./types";

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

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  dialer: DIALER_PRESETS.ringcentral,
  alwaysOnTop: false,
  launchAtLogin: false,
  appearance: DEFAULT_APPEARANCE,
};

export const WIDGET_DEFAULT_SIZE = { width: 340, height: 520 };
export const WIDGET_MIN_SIZE = { width: 280, height: 220 };
