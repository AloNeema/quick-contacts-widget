import { describe, expect, it } from "vitest";
import { extractMentionTodos, mergeTodos, type ConnectFeedElement } from "./chatterTodo";

const ME = "005ME";
const mention = (id: string, name: string) => ({ type: "Mention", text: `@${name}`, record: { id } });
const text = (t: string) => ({ type: "Text", text: t });

const feed: ConnectFeedElement[] = [
  {
    id: "0D5A",
    createdDate: "2026-11-12T15:00:00.000Z",
    actor: { id: "005SAM", displayName: "Sam Ortiz" },
    parent: { id: "006OPP", name: "BrightPath – Equipment line" },
    body: { text: "@Nick can you send the term sheet?", messageSegments: [mention(ME, "Nick"), text(" can you send the term sheet?")] },
    capabilities: {
      comments: {
        page: {
          items: [
            { id: "0D7C1", createdDate: "2026-11-12T16:00:00.000Z", user: { id: "005ANA", displayName: "Ana Lee" }, body: { text: "@Nick also the W-9 please", messageSegments: [mention(ME, "Nick"), text(" also the W-9 please")] } },
            { id: "0D7C2", createdDate: "2026-11-12T17:00:00.000Z", user: { id: ME, displayName: "Nick" }, body: { text: "@Ana on it", messageSegments: [mention("005ANA", "Ana"), text(" on it")] } },
            { id: "0D7C3", createdDate: "2026-11-12T18:00:00.000Z", user: { id: "005SAM", displayName: "Sam Ortiz" }, body: { text: "thanks", messageSegments: [text("thanks")] } },
          ],
        },
      },
    },
  },
  // Someone else mentioned, not me.
  { id: "0D5B", createdDate: "2026-11-12T19:00:00.000Z", actor: { id: "005SAM", displayName: "Sam Ortiz" }, body: { messageSegments: [mention("005ANA", "Ana"), text(" fyi")] } },
  // I mentioned myself: not a request for help.
  { id: "0D5C", createdDate: "2026-11-12T20:00:00.000Z", actor: { id: ME, displayName: "Nick" }, body: { messageSegments: [mention(ME, "Nick"), text(" reminder")] } },
  // Older API shape: mention carries `user` instead of `record`; no body.text.
  { id: "0D5D", createdDate: "2026-11-11T09:00:00.000Z", actor: { id: "005ROB", name: "Rob K" }, body: { messageSegments: [{ type: "Mention", text: "@Nick", user: { id: ME } }, text(" call the client")] } },
];

describe("Chatter mention to-dos", () => {
  const todos = extractMentionTodos(feed, ME, "https://acme.my.salesforce.com/");
  it("finds mentions in posts and in replies, newest first", () => {
    expect(todos.map((t) => t.id)).toEqual(["0D7C1", "0D5A", "0D5D"]);
  });
  it("records who asked, where, the text and a link to the thread", () => {
    expect(todos[0]).toMatchObject({ kind: "comment", feedElementId: "0D5A", authorName: "Ana Lee", parentName: "BrightPath – Equipment line", text: "@Nick also the W-9 please", url: "https://acme.my.salesforce.com/0D5A" });
    expect(todos[1]).toMatchObject({ kind: "post", authorName: "Sam Ortiz", text: "@Nick can you send the term sheet?" });
  });
  it("skips others' mentions, self-mentions and replies without a mention", () => {
    expect(todos.some((t) => ["0D5B", "0D5C", "0D7C2", "0D7C3"].includes(t.id))).toBe(false);
  });
  it("handles the older `user` mention shape and missing body text", () => {
    expect(todos[2]).toMatchObject({ id: "0D5D", authorName: "Rob K", text: "@Nick call the client" });
  });
  it("keeps earlier mentions that scrolled off the feed, drops very old ones", () => {
    const old = { ...todos[2], id: "OLD", createdAt: "2026-01-01T00:00:00.000Z" };
    const kept = { ...todos[2], id: "KEPT", createdAt: "2026-11-01T00:00:00.000Z" };
    const merged = mergeTodos([old, kept], todos, Date.parse("2026-11-13T00:00:00Z"));
    expect(merged.map((t) => t.id)).toEqual(["0D7C1", "0D5A", "0D5D", "KEPT"]);
  });
});
