/**
 * Who in your recent mail is a client. Pure rules so they can be tested and
 * tuned without Outlook:
 *  - never: yourself, coworkers, lender/partner domains, no-reply senders,
 *    newsletters and calendar/auto-replies;
 *  - always: anyone found in Salesforce as a Contact or Lead;
 *  - otherwise scored: replied to your email (2), sent 2+ messages with
 *    attachments (2) or one (1), emailed you more than once (1), a real
 *    back-and-forth (1). A score of 2 or more makes the list.
 * They must have emailed you at least once in the window.
 */
import type { ClientCandidate, ClientItem, ClientMark, ClientReason, Contact, MailMessageLite } from "./types";

// Small-business owners often write from info@, sales@, hello@, admin@ or team@, so those
// shared mailboxes stay eligible; bulk mail from them is still caught by the score and BULK_PREVIEW.
const AUTOMATED_LOCAL =
  /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|alerts?|mailer(-daemon)?|bounces?|news(letter)?s?|marketing|promo(tions)?|updates?|digest|billing|receipts?|invoices?|postmaster|support|help|calendar|security|feedback|reply|automated|system|events?|webinars?|community)$/i;
// "read:" ends in punctuation, so it sits outside the \b group (a \b after ":" needs a letter next).
const AUTOMATED_SUBJECT = /^(?:(?:accepted|declined|tentative|canceled|cancelled|updated invitation|invitation|automatic reply|auto(?:matic)?[- ]?reply|out of office|undeliverable|delivery status notification)\b|read:)/i;
const BULK_PREVIEW = /\b(unsubscribe|view (this email )?in (your )?browser|manage (your )?(email )?preferences|you are receiving this)\b/i;
const REPLY_SUBJECT = /^\s*(re|aw|sv|antw)\s*:/i;

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at < 0 ? "" : address.slice(at + 1).toLowerCase();
}

export function isAutomatedAddress(address: string): boolean {
  const local = address.slice(0, Math.max(0, address.lastIndexOf("@"))).toLowerCase();
  return !local || AUTOMATED_LOCAL.test(local) || /no-?reply|donotreply|bounce|newsletter/i.test(local);
}

const matchesDomain = (d: string, list: Set<string>) => {
  for (const dom of list) if (d === dom || d.endsWith(`.${dom}`)) return true;
  return false;
};

function prettyName(name: string | undefined, address: string): string {
  const n = (name ?? "").replace(/["']/g, "").trim();
  if (n && !n.includes("@")) return n;
  const local = address.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local.replace(/\b\w/g, (c) => c.toUpperCase()) || address;
}

export const normDomain = (d: string) => d.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

/** Lender domains from settings plus domains of contacts in any group whose name mentions "lender". */
export function excludedLenderDomains(settingsDomains: string[], contacts: Contact[]): string[] {
  const out = new Set(settingsDomains.map(normDomain).filter(Boolean));
  for (const c of contacts) if (c.email && /lender/i.test(c.group ?? "")) out.add(domainOf(c.email));
  return [...out];
}

/** Group recent mail into one candidate per outside person, dropping everyone who can never be a client. */
export function buildCandidates(
  messages: MailMessageLite[],
  opts: { myAddresses: string[]; internalDomains: string[]; lenderDomains: string[] },
): ClientCandidate[] {
  const mine = new Set(opts.myAddresses.map((a) => a.toLowerCase()));
  const blocked = new Set([...opts.internalDomains, ...opts.lenderDomains].map(normDomain).filter(Boolean));
  const out = new Map<string, ClientCandidate>();
  const sentConversations = new Map<string, string>(); // conversationId -> first time you wrote in it
  const sentTo = new Map<string, string>(); // email -> first time you wrote to them
  const sorted = [...messages].sort((a, b) => a.at.localeCompare(b.at));

  for (const m of sorted) {
    if (AUTOMATED_SUBJECT.test(m.subject.trim())) continue;
    if (m.direction === "in" && m.preview && BULK_PREVIEW.test(m.preview)) continue;
    const people = m.direction === "in" ? (m.from ? [m.from] : []) : m.to;
    if (m.direction === "out" && m.conversationId && !sentConversations.has(m.conversationId)) sentConversations.set(m.conversationId, m.at);
    for (const p of people) {
      const email = p.address.trim().toLowerCase();
      const domain = domainOf(email);
      if (!domain || mine.has(email) || matchesDomain(domain, blocked) || isAutomatedAddress(email)) continue;
      const c: ClientCandidate = out.get(email) ?? {
        email,
        name: prettyName(p.name, email),
        domain,
        lastActivityAt: m.at,
        lastSubject: "",
        lastDirection: m.direction,
        inboundCount: 0,
        outboundCount: 0,
        attachmentMessages: 0,
        repliedToYou: false,
      };
      if (p.name && !p.name.includes("@")) c.name = prettyName(p.name, email);
      if (m.direction === "in") {
        c.inboundCount++;
        c.lastInboundAt = m.at;
        if (m.hasAttachments) c.attachmentMessages++;
        const wroteFirst = (m.conversationId && sentConversations.has(m.conversationId)) || (REPLY_SUBJECT.test(m.subject) && sentTo.has(email));
        if (wroteFirst) c.repliedToYou = true;
      } else {
        c.outboundCount++;
        c.lastOutboundAt = m.at;
        if (!sentTo.has(email)) sentTo.set(email, m.at);
      }
      c.lastActivityAt = m.at;
      c.lastSubject = m.subject || "(no subject)";
      c.lastPreview = m.preview;
      c.lastDirection = m.direction;
      // Keep the link paired with the displayed message, never an older email.
      c.webLink = m.webLink;
      out.set(email, c);
    }
  }
  return [...out.values()];
}

export function clientReasons(c: ClientCandidate, inSalesforce: boolean): { reasons: ClientReason[]; score: number } {
  const reasons: ClientReason[] = [];
  let score = 0;
  if (inSalesforce) reasons.push("salesforce");
  const add = (r: ClientReason, pts: number) => {
    reasons.push(r);
    score += pts;
  };
  if (c.repliedToYou) add("replied", 2);
  if (c.attachmentMessages >= 2) add("attachments", 2);
  else if (c.attachmentMessages === 1) add("attachments", 1);
  if (c.inboundCount >= 2) add("repeat", 1);
  if (c.inboundCount >= 1 && c.outboundCount >= 1) add("conversation", 1);
  return { reasons, score };
}

export function isClient(c: ClientCandidate, inSalesforce: boolean): boolean {
  if (c.inboundCount === 0) return false; // they must have contacted you
  if (inSalesforce) return true;
  return clientReasons(c, false).score >= 2;
}

/**
 * The Clients tab: newest contact first. Hidden people come back only if
 * they email again after you hid them; "not a client" never comes back.
 */
/** Stamp first-seen for people newly on the list; the first scan seeds "" so the badge starts at zero. */
export function stampFirstSeen(firstSeen: Record<string, string>, emails: string[], firstScan: boolean, now: string): void {
  // Check the key, not the value: seeded entries hold "" and must not be re-stamped as new.
  for (const e of emails) if (!Object.hasOwn(firstSeen, e)) firstSeen[e] = firstScan ? "" : now;
}

export function computeClients(
  candidates: ClientCandidate[],
  contacts: Contact[],
  marks: Record<string, ClientMark>,
  salesforceEmails: Set<string>,
  firstSeen: Record<string, string>,
  lastViewedAt: string | undefined,
): { items: ClientItem[]; hiddenCount: number } {
  const byEmail = new Map(contacts.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]));
  const items: ClientItem[] = [];
  let hiddenCount = 0;
  for (const c of candidates) {
    const inSalesforce = salesforceEmails.has(c.email) || Boolean(byEmail.get(c.email)?.sf);
    if (!isClient(c, inSalesforce)) continue;
    const mark = marks[c.email];
    if (mark?.notClient || (mark?.hiddenAt && (c.lastInboundAt ?? "") <= mark.hiddenAt)) {
      hiddenCount++;
      continue;
    }
    const contact = byEmail.get(c.email);
    const seen = firstSeen[c.email];
    items.push({
      ...c,
      name: contact?.name ?? c.name,
      contactId: contact?.id,
      inSalesforce,
      reasons: clientReasons(c, inSalesforce).reasons,
      waitingOnYou: c.lastDirection === "in",
      isNew: Boolean(seen && (!lastViewedAt || seen > lastViewedAt)),
    });
  }
  items.sort((a, b) => (b.lastInboundAt ?? b.lastActivityAt).localeCompare(a.lastInboundAt ?? a.lastActivityAt));
  return { items, hiddenCount };
}
