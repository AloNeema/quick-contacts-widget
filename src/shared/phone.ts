import type { Contact, DialAction, PhoneLabel } from "./types";

/** One shared choice for every call/text entry point. Falls back when a starred number is removed. */
export function preferredPhone(contact: Pick<Contact, "phone" | "mobilePhone" | "defaultCallPhone" | "defaultTextPhone">, action: DialAction): { phone: string; label: PhoneLabel } | undefined {
  const preferred = action === "call" ? contact.defaultCallPhone ?? "office" : contact.defaultTextPhone ?? "cell";
  const numbers = { office: contact.phone, cell: contact.mobilePhone };
  const fallback = preferred === "office" ? "cell" : "office";
  if (numbers[preferred]) return { phone: numbers[preferred]!, label: preferred };
  if (numbers[fallback]) return { phone: numbers[fallback]!, label: fallback };
  return undefined;
}

/** Normalize a US phone to E.164 (+1XXXXXXXXXX). Returns "" if not 10/11 digits. */
export function normalizeUsPhone(raw: string | undefined | null): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

/** +15551234567 -> (555) 123-4567. Non-US / unknown shapes are returned as-is. */
export function formatPhoneForDisplay(e164: string | undefined | null): string {
  const digits = (e164 || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return e164 || "";
}

export function normalizeEmail(raw: string | undefined | null): string {
  const v = (raw || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : "";
}
