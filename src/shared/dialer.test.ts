import { describe, expect, it } from "vitest";
import { buildDialUri, buildLinkedinUri, buildMailtoUri, schemeOf } from "./dialer";
import { CUSTOM_DIALER_TEMPLATE, DIALER_PRESETS } from "./defaults";

describe("buildDialUri", () => {
  it("builds RingCentral call and sms links", () => {
    expect(buildDialUri(DIALER_PRESETS.ringcentral, "call", "+15551234567")).toBe("rcapp://r/call?number=%2B15551234567");
    expect(buildDialUri(DIALER_PRESETS.ringcentral, "sms", "+15551234567")).toBe("rcapp://r/sms?type=new&number=%2B15551234567");
  });
  it("builds Phone Link / system tel and sms links", () => {
    expect(buildDialUri(DIALER_PRESETS.phonelink, "call", "+15551234567")).toBe("tel:%2B15551234567");
    expect(buildDialUri(DIALER_PRESETS.system, "sms", "+15551234567")).toBe("sms:%2B15551234567");
  });
  it("supports {digits} and {national} placeholders in a custom template", () => {
    const custom = { ...CUSTOM_DIALER_TEMPLATE, callTemplate: "myphone://dial/{national}?full={digits}" };
    expect(buildDialUri(custom, "call", "+15551234567")).toBe("myphone://dial/5551234567?full=15551234567");
  });
  it("rejects templates without a placeholder, unknown schemes on presets, and dangerous schemes", () => {
    expect(() => buildDialUri({ ...DIALER_PRESETS.system, callTemplate: "tel:5551234567" }, "call", "+15551234567")).toThrow(/placeholder|contain/);
    expect(() => buildDialUri({ ...DIALER_PRESETS.system, callTemplate: "evil://{e164}" }, "call", "+15551234567")).toThrow(/not allowed/);
    expect(() => buildDialUri({ ...CUSTOM_DIALER_TEMPLATE, callTemplate: "javascript:alert({digits})" }, "call", "+15551234567")).toThrow(/not allowed/);
    expect(() => buildDialUri({ ...CUSTOM_DIALER_TEMPLATE, callTemplate: "file:///{digits}" }, "call", "+15551234567")).toThrow(/not allowed/);
  });
  it("rejects non-E.164 numbers", () => {
    expect(() => buildDialUri(DIALER_PRESETS.system, "call", "555-1234")).toThrow(/E\.164/);
  });
});

describe("schemeOf / mailto / linkedin", () => {
  it("extracts schemes", () => {
    expect(schemeOf("rcapp://r/call")).toBe("rcapp:");
    expect(schemeOf("TEL:123")).toBe("tel:");
    expect(schemeOf("no scheme")).toBe("");
  });
  it("builds mailto and validates", () => {
    expect(buildMailtoUri("Nick@Example.com")).toBe("mailto:Nick@Example.com");
    expect(() => buildMailtoUri("nope")).toThrow();
  });
  it("only opens https linkedin links", () => {
    expect(buildLinkedinUri("https://www.linkedin.com/in/someone/")).toBe("https://www.linkedin.com/in/someone/");
    expect(() => buildLinkedinUri("http://linkedin.com/in/x")).toThrow();
    expect(() => buildLinkedinUri("https://evil.com/linkedin.com")).toThrow();
  });
});
