import { afterEach, describe, expect, it } from "vitest";
import { get } from "node:http";
import { TalkdeskHandoff } from "../main/talkdesk";
import { buildDialUri } from "./dialer";
import { DIALER_PRESETS } from "./defaults";

let now = Date.now();
const handoff = new TalkdeskHandoff(() => now);
afterEach(async () => { await handoff.close(); now = Date.now(); });

describe("Talkdesk calling pilot", () => {
  it("serves only the selected number behind an opaque loopback link without auto-dialing", async () => {
    const url = await handoff.create("+12025550123");
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/call\/[a-f0-9]{64}$/);
    expect(url).not.toContain("202555");
    const response = await fetch(url);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('id="phone">+12025550123');
    expect(html).toContain("Talkdesk's Call option");
    expect(html).not.toMatch(/href="(?:tel|sms|rcapp):/);
    expect(html).not.toContain("clickToCall");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("rejects untrusted origins, host headers, methods and missing tickets", async () => {
    const url = await handoff.create("+12025550123");
    expect((await fetch(url, { headers: { Origin: "https://untrusted.example" } })).status).toBe(403);
    const wrongHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      get(url, { headers: { Host: "untrusted.example" } }, response => { response.resume(); resolve(response.statusCode); }).once("error", reject);
    });
    expect(wrongHostStatus).toBe(403);
    expect((await fetch(url, { method: "POST" })).status).toBe(403);
    expect((await fetch(new URL("/", url))).status).toBe(410);
  });

  it("expires tickets and bounds memory used by old pages", async () => {
    const old = await handoff.create("+12025550123");
    now += 10 * 60 * 1000;
    expect((await fetch(old)).status).toBe(410);
    const first = await handoff.create("+12025550123");
    let last = first;
    for (let i = 0; i < 20; i++) last = await handoff.create("+12025550124");
    expect((await fetch(first)).status).toBe(410);
    expect((await fetch(last)).status).toBe(200);
  });

  it("does not render unsafe phone input or fall back to an OS dialing handler", async () => {
    await expect(handoff.create('<script>alert(1)</script>')).rejects.toThrow(/E\.164/);
    await expect(handoff.create("2025550123")).rejects.toThrow(/E\.164/);
    expect(() => buildDialUri(DIALER_PRESETS.talkdesk, "call", "+12025550123")).toThrow(/Chrome handoff/);
    expect(() => buildDialUri(DIALER_PRESETS.talkdesk, "sms", "+12025550123")).toThrow(/Chrome handoff/);
  });
});
