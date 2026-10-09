import { describe, expect, it } from "vitest";
import { splitEmailText, tidyEmailText } from "./emailText";

describe("email preview text", () => {
  it("tidies line endings, trailing spaces and runs of blank lines", () => {
    expect(tidyEmailText("Hi Nick,  \r\n\r\n\r\n\r\nSee attached.\u00a0\r\n")).toBe("Hi Nick,\n\nSee attached.");
  });
  it("splits an Outlook reply from the quoted thread", () => {
    const r = splitEmailText("Sounds good, sending docs today.\n\nDana\n\nFrom: Nick <nick@x.com>\nSent: Monday\nSubject: Funding");
    expect(r.body).toBe("Sounds good, sending docs today.\n\nDana");
    expect(r.quoted).toMatch(/^From: Nick/);
  });
  it("splits Gmail-style and > quotes", () => {
    expect(splitEmailText("Yes.\nOn Mon, Oct 5, 2026 at 9:00 AM Nick <n@x.com> wrote:\n> Can you send it?").body).toBe("Yes.");
    expect(splitEmailText("Ok\n> earlier").quoted).toBe("> earlier");
  });
  it("keeps a message that is only a forwarded thread as the body", () => {
    const r = splitEmailText("From: Someone\nSubject: Fwd");
    expect(r.body).toBe("From: Someone\nSubject: Fwd");
    expect(r.quoted).toBeUndefined();
  });
  it("caps very long bodies", () => {
    const r = splitEmailText("a".repeat(25_000));
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBeLessThanOrEqual(20_001);
  });
});
