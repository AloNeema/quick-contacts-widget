import { describe, expect, it } from "vitest";
import { preferredPhone } from "./phone";

describe("phone defaults", () => {
  const both = { phone: "+12025550101", mobilePhone: "+12025550102" };
  it("calls office and texts cell unless stars say otherwise", () => {
    expect(preferredPhone(both, "call")).toEqual({ phone: both.phone, label: "office" });
    expect(preferredPhone(both, "sms")).toEqual({ phone: both.mobilePhone, label: "cell" });
    expect(preferredPhone({ ...both, defaultCallPhone: "cell", defaultTextPhone: "office" }, "call")?.phone).toBe(both.mobilePhone);
    expect(preferredPhone({ ...both, defaultCallPhone: "cell", defaultTextPhone: "office" }, "sms")?.phone).toBe(both.phone);
  });
  it("keeps legacy contacts usable and falls back when a preferred number is missing", () => {
    expect(preferredPhone({ phone: both.phone }, "sms")?.phone).toBe(both.phone);
    expect(preferredPhone({ mobilePhone: both.mobilePhone }, "call")?.phone).toBe(both.mobilePhone);
    expect(preferredPhone({ phone: both.phone, defaultCallPhone: "cell" }, "call")?.phone).toBe(both.phone);
    expect(preferredPhone({ mobilePhone: both.mobilePhone, defaultTextPhone: "office" }, "sms")?.phone).toBe(both.mobilePhone);
    expect(preferredPhone({}, "call")).toBeUndefined();
  });
});
