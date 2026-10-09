/** Plain-text email bodies for the in-widget preview: tidy whitespace and split off the quoted thread. */

const MAX_BODY = 20_000;

// Lines that start the quoted history in Outlook, Gmail and Apple Mail replies.
const QUOTE_START = [
  /^-{2,}\s*original message\s*-{2,}$/i,
  /^_{5,}$/,
  /^from:\s.+$/i,
  /^on .{4,200} wrote:$/i,
  /^>/,
];

export function tidyEmailText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Newest message first; everything from the first quote marker on is `quoted`. */
export function splitEmailText(raw: string): { body: string; quoted?: string; truncated: boolean } {
  let text = tidyEmailText(raw);
  const truncated = text.length > MAX_BODY;
  if (truncated) text = `${text.slice(0, MAX_BODY).trimEnd()}…`;
  const lines = text.split("\n");
  // Never treat the first line as a quote marker: a body that is all quote stays visible as the body.
  const at = lines.findIndex((l, i) => i > 0 && QUOTE_START.some((re) => re.test(l.trim())));
  if (at === -1) return { body: text, truncated };
  const body = lines.slice(0, at).join("\n").trim();
  const quoted = lines.slice(at).join("\n").trim();
  return body ? { body, quoted, truncated } : { body: text, truncated };
}
