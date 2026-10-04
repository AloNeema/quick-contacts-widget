import { describe, expect, it } from "vitest";
import { buildCandidates, computeClients, excludedLenderDomains, isAutomatedAddress, isClient } from "./clients";
import { createContact } from "./merge";
import type { ClientCandidate, MailMessageLite } from "./types";

const opts = { myAddresses: ["nick@quick-capitalfunding.com"], internalDomains: ["quick-capitalfunding.com"], lenderDomains: ["bigfunder.com"] };
let n = 0;
const m = (over: Partial<MailMessageLite> & Pick<MailMessageLite, "direction" | "at">): MailMessageLite => ({ id: String(n++), subject: "Funding", to: [], ...over });
const candidate = (over: Partial<ClientCandidate>): ClientCandidate => ({
  email: "x@biz.com", name: "X", domain: "biz.com", lastActivityAt: "2026-10-01T00:00:00Z", lastSubject: "s", lastDirection: "in",
  inboundCount: 1, outboundCount: 0, attachmentMessages: 0, repliedToYou: false, ...over,
});

describe("buildCandidates", () => {
  it("drops yourself, coworkers, lenders, automated senders, newsletters and calendar mail", () => {
    const list = buildCandidates(
      [
        m({ direction: "in", at: "2026-10-01T01:00:00Z", from: { address: "sam@quick-capitalfunding.com" } }),
        m({ direction: "in", at: "2026-10-01T02:00:00Z", from: { address: "uw@bigfunder.com" } }),
        m({ direction: "in", at: "2026-10-01T03:00:00Z", from: { address: "no-reply@docusign.net" } }),
        m({ direction: "in", at: "2026-10-01T04:00:00Z", from: { address: "deals@promo.com" }, preview: "Big sale! Click to unsubscribe" }),
        m({ direction: "in", at: "2026-10-01T05:00:00Z", subject: "Accepted: Call", from: { address: "dana@brightpath.com" } }),
        m({ direction: "in", at: "2026-10-01T06:00:00Z", from: { name: "Dana Whitfield", address: "Dana@BrightPath.com" }, hasAttachments: true }),
      ],
      opts,
    );
    expect(list.map((c) => c.email)).toEqual(["dana@brightpath.com"]);
    expect(list[0]).toMatchObject({ name: "Dana Whitfield", attachmentMessages: 1, inboundCount: 1 });
  });
  it("detects a reply to your email by conversation or by Re: subject", () => {
    const [byConv] = buildCandidates(
      [
        m({ direction: "out", at: "2026-10-01T01:00:00Z", conversationId: "c1", to: [{ address: "rob@kestrel.com" }] }),
        m({ direction: "in", at: "2026-10-02T01:00:00Z", conversationId: "c1", from: { address: "rob@kestrel.com" } }),
      ],
      opts,
    );
    expect(byConv).toMatchObject({ repliedToYou: true, outboundCount: 1, inboundCount: 1, lastDirection: "in" });
    const [bySubject] = buildCandidates(
      [
        m({ direction: "out", at: "2026-10-01T01:00:00Z", to: [{ address: "amy@shop.com" }] }),
        m({ direction: "in", at: "2026-10-02T01:00:00Z", subject: "RE: Funding", from: { address: "amy@shop.com" } }),
      ],
      opts,
    );
    expect(bySubject.repliedToYou).toBe(true);
    const [cold] = buildCandidates([m({ direction: "in", at: "2026-10-02T01:00:00Z", subject: "Re: your listing", from: { address: "cold@pitch.com" } })], opts);
    expect(cold.repliedToYou).toBe(false);
  });
  it("flags automated mailboxes", () => {
    expect(isAutomatedAddress("donotreply@x.com")).toBe(true);
    expect(isAutomatedAddress("newsletter-team@x.com")).toBe(true);
    expect(isAutomatedAddress("dana.whitfield@x.com")).toBe(false);
  });
});

describe("isClient", () => {
  it("accepts Salesforce matches outright once they have emailed you", () => {
    expect(isClient(candidate({}), true)).toBe(true);
    expect(isClient(candidate({ inboundCount: 0, outboundCount: 2 }), true)).toBe(false);
  });
  it("scores replies, attachments and repeat contact", () => {
    expect(isClient(candidate({}), false)).toBe(false); // one cold email
    expect(isClient(candidate({ repliedToYou: true }), false)).toBe(true);
    expect(isClient(candidate({ attachmentMessages: 2, inboundCount: 2 }), false)).toBe(true);
    expect(isClient(candidate({ attachmentMessages: 1 }), false)).toBe(false);
    expect(isClient(candidate({ attachmentMessages: 1, inboundCount: 2 }), false)).toBe(true);
    expect(isClient(candidate({ inboundCount: 1, outboundCount: 1 }), false)).toBe(false);
    expect(isClient(candidate({ inboundCount: 2, outboundCount: 1 }), false)).toBe(true);
  });
});

describe("excludedLenderDomains", () => {
  it("merges settings with domains of contacts in a Lenders group", () => {
    const lender = createContact({ name: "UW", email: "uw@capfund.com", group: "Lenders" }, 0);
    const broker = createContact({ name: "B", email: "b@broker.com", group: "Brokers" }, 1);
    expect(excludedLenderDomains(["@BigFunder.com", "https://www.ondeck.com/"], [lender, broker]).sort()).toEqual(["bigfunder.com", "capfund.com", "ondeck.com"]);
  });
});

describe("computeClients", () => {
  const a = candidate({ email: "a@x.com", repliedToYou: true, lastInboundAt: "2026-10-03T00:00:00Z", lastActivityAt: "2026-10-03T00:00:00Z" });
  const b = candidate({ email: "b@x.com", repliedToYou: true, lastInboundAt: "2026-10-05T00:00:00Z", lastActivityAt: "2026-10-06T00:00:00Z", lastDirection: "out" });
  const c = candidate({ email: "c@x.com", lastInboundAt: "2026-10-04T00:00:00Z" });

  it("lists newest contact first and marks who is waiting on you", () => {
    const { items } = computeClients([a, b, c], [], {}, new Set(["c@x.com"]), {}, undefined);
    expect(items.map((i) => i.email)).toEqual(["b@x.com", "c@x.com", "a@x.com"]);
    expect(items.find((i) => i.email === "c@x.com")).toMatchObject({ inSalesforce: true, reasons: ["salesforce"], waitingOnYou: true });
    expect(items.find((i) => i.email === "b@x.com")?.waitingOnYou).toBe(false);
  });
  it("counts as new only what appeared after your last visit", () => {
    const { items } = computeClients([a, b], [], {}, new Set(), { "a@x.com": "2026-10-01T00:00:00Z", "b@x.com": "2026-10-06T00:00:00Z" }, "2026-10-05T00:00:00Z");
    expect(items.filter((i) => i.isNew).map((i) => i.email)).toEqual(["b@x.com"]);
  });
  it("hides until they email again, and never shows a non-client", () => {
    const hidden = computeClients([a], [], { "a@x.com": { hiddenAt: "2026-10-04T00:00:00Z" } }, new Set(), {}, undefined);
    expect(hidden.items).toHaveLength(0);
    expect(hidden.hiddenCount).toBe(1);
    const back = computeClients([{ ...a, lastInboundAt: "2026-10-05T00:00:00Z" }], [], { "a@x.com": { hiddenAt: "2026-10-04T00:00:00Z" } }, new Set(), {}, undefined);
    expect(back.items).toHaveLength(1);
    expect(computeClients([{ ...a, lastInboundAt: "2026-10-09T00:00:00Z" }], [], { "a@x.com": { notClient: true } }, new Set(), {}, undefined).items).toHaveLength(0);
  });
  it("links to an existing contact and treats a Salesforce-linked contact as in Salesforce", () => {
    const contact = { ...createContact({ name: "Amy Shop", email: "c@x.com" }, 0), sf: { kind: "contact" as const, id: "003", syncedAt: "x" } };
    const { items } = computeClients([c], [contact], {}, new Set(), {}, undefined);
    expect(items[0]).toMatchObject({ contactId: contact.id, name: "Amy Shop", inSalesforce: true });
  });
});
