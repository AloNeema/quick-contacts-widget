import { describe, expect, it, vi } from "vitest";
import { dispatchDial } from "../main/dial";
import { DIALER_PRESETS } from "./defaults";

const services = () => ({
  openExternal: vi.fn(async () => ({ ok: true as const })),
  copy: vi.fn(),
  recordUse: vi.fn(async () => undefined),
});
const request = { phone: "+12025550123", contactId: "test-contact" };

describe("Talkdesk action routing", () => {
  it("copies calling numbers without opening a browser, dialing or recording a completed contact", async () => {
    const deps = services();
    expect(await dispatchDial(DIALER_PRESETS.talkdesk, { ...request, action: "call" }, deps)).toMatchObject({ ok: true });
    expect(deps.copy).toHaveBeenCalledWith(request.phone);
    expect(deps.openExternal).not.toHaveBeenCalled();
    expect(deps.recordUse).not.toHaveBeenCalled();
  });
  it("copies texting numbers without sending, opening another app or updating history", async () => {
    const deps = services();
    expect(await dispatchDial(DIALER_PRESETS.talkdesk, { ...request, action: "sms" }, deps)).toMatchObject({ ok: true, message: expect.stringContaining("No message was sent") });
    expect(deps.copy).toHaveBeenCalledWith(request.phone);
    expect(deps.openExternal).not.toHaveBeenCalled();
    expect(deps.recordUse).not.toHaveBeenCalled();
  });
  it("rejects invalid phone input before exposing it to any destination", async () => {
    const deps = services();
    expect(await dispatchDial(DIALER_PRESETS.talkdesk, { ...request, phone: "bad", action: "sms" }, deps)).toMatchObject({ ok: false });
    expect(deps.copy).not.toHaveBeenCalled();
  });
  it("reports clipboard errors and never falls back to a different dialer", async () => {
    const deps = services();
    deps.copy.mockImplementationOnce(() => { throw new Error("Clipboard unavailable"); });
    expect(await dispatchDial(DIALER_PRESETS.talkdesk, { ...request, action: "call" }, deps)).toEqual({ ok: false, error: "Clipboard unavailable" });
    expect(deps.openExternal).not.toHaveBeenCalled();
    expect(deps.recordUse).not.toHaveBeenCalled();
  });
  it("preserves RingCentral routing and its existing history behavior", async () => {
    const deps = services();
    expect(await dispatchDial(DIALER_PRESETS.ringcentral, { ...request, action: "call" }, deps)).toEqual({ ok: true });
    expect(deps.openExternal).toHaveBeenCalledWith("rcapp://r/call?number=%2B12025550123");
    expect(deps.recordUse).toHaveBeenCalledWith(request.contactId);
  });
});
