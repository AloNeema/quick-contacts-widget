import type { SalesforceRecordLink } from "./types";

/** Only build record links from an authenticated Salesforce instance and a real record ID. */
export function salesforceRecordUrl(instanceUrl: string | undefined, id: string | undefined): string | undefined {
  if (!instanceUrl || !id || !/^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(id)) return undefined;
  try {
    const url = new URL(instanceUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(url.hostname === "salesforce.com" || url.hostname.endsWith(".salesforce.com") || url.hostname.endsWith(".force.com"))) return undefined;
    return url.origin + "/" + id;
  } catch { return undefined; }
}

export function matchSalesforceLinks(
  instanceUrl: string | undefined,
  contacts: Array<{ Id: string; Email?: string }>,
  leads: Array<{ Id: string; Email?: string }>,
): Record<string, SalesforceRecordLink> {
  const matches: Record<string, SalesforceRecordLink> = {};
  for (const [kind, records] of [["contact", contacts], ["lead", leads]] as const) {
    for (const record of records) {
      const email = record.Email?.trim().toLowerCase();
      const url = salesforceRecordUrl(instanceUrl, record.Id);
      if (email && url && !Object.prototype.hasOwnProperty.call(matches, email)) matches[email] = { kind, id: record.Id, url };
    }
  }
  return matches;
}
