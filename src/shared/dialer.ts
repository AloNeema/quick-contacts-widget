import type { DialAction, DialerProvider } from "./types";

export const ALLOWED_SCHEMES = new Set(["tel:", "sms:", "mailto:", "rcapp:", "msteams:", "callto:", "sip:"]);

export class DialerError extends Error {}

/** Scheme of a URI template such as "rcapp://r/call?number={e164}" -> "rcapp:". */
export function schemeOf(uri: string): string {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(uri.trim());
  return m ? `${m[1].toLowerCase()}:` : "";
}

/** Fill {e164} / {digits} / {national} placeholders. Input must already be E.164. */
export function fillPhoneTemplate(template: string, e164: string): string {
  if (!/^\+\d{10,15}$/.test(e164)) throw new DialerError("Phone number must be in E.164 form");
  const digits = e164.slice(1);
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return template
    .replaceAll("{e164}", encodeURIComponent(e164))
    .replaceAll("{digits}", digits)
    .replaceAll("{national}", national);
}

/**
 * Build the URI the OS should open for a call / text. The scheme must be on the
 * allowlist, or match the scheme the user put in a custom template.
 */
export function buildDialUri(provider: DialerProvider, action: DialAction, e164: string): string {
  if (provider.id === "talkdesk") throw new DialerError("Talkdesk copies the number to the clipboard");
  const template = action === "call" ? provider.callTemplate : provider.smsTemplate;
  if (!template.includes("{e164}") && !template.includes("{digits}") && !template.includes("{national}")) {
    throw new DialerError("Dialer template must contain {e164}, {digits} or {national}");
  }
  const uri = fillPhoneTemplate(template, e164);
  const scheme = schemeOf(uri);
  if (!scheme) throw new DialerError("Dialer template has no URI scheme");
  const customScheme = provider.id === "custom" ? schemeOf(template) : "";
  if (!ALLOWED_SCHEMES.has(scheme) && scheme !== customScheme) {
    throw new DialerError(`Scheme ${scheme} is not allowed`);
  }
  if (scheme === "javascript:" || scheme === "file:" || scheme === "data:") {
    throw new DialerError(`Scheme ${scheme} is not allowed`);
  }
  return uri;
}

export function buildMailtoUri(email: string): string {
  const v = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new DialerError("Invalid email address");
  return `mailto:${encodeURIComponent(v).replace("%40", "@")}`;
}

const LINK_HOSTS = [/(^|\.)linkedin\.com$/i, /(^|\.)outlook\.office\.com$/i, /(^|\.)outlook\.office365\.com$/i, /(^|\.)outlook\.live\.com$/i, /(^|\.)teams\.microsoft\.com$/i, /(^|\.)teams\.cloud\.microsoft$/i, /(^|\.)zoom\.us$/i, /(^|\.)salesforce\.com$/i, /(^|\.)force\.com$/i, /(^|\.)salesforce-setup\.com$/i];

/** Only https links to LinkedIn, Outlook on the web, Teams or Zoom are opened. */
export function buildLinkedinUri(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new DialerError("Invalid LinkedIn URL");
  }
  if (parsed.protocol !== "https:" || !LINK_HOSTS.some((re) => re.test(parsed.hostname))) {
    throw new DialerError("Only LinkedIn, Outlook, Teams, Zoom and Salesforce links are opened");
  }
  return parsed.toString();
}
