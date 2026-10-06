import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: {
    isPackaged: true,
    getVersion: vi.fn(() => "0.1.4"),
    setLoginItemSettings: vi.fn(),
  },
}));
vi.mock("electron", () => electron);
import { applyLaunchAtLogin } from "../main/autoLaunch";

beforeEach(() => {
  vi.resetAllMocks();
  electron.app.isPackaged = true;
  electron.app.getVersion.mockReturnValue("0.1.4");
});
afterEach(() => vi.restoreAllMocks());

describe("launch at login isolation", () => {
  it.each([true, false])("leaves the regular app's startup entry untouched from a preview (enabled=%s)", (enabled) => {
    electron.app.getVersion.mockReturnValue("0.1.4-beta.3");
    applyLaunchAtLogin(enabled);
    expect(electron.app.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it.each([true, false])("never registers or removes a startup entry from development (enabled=%s)", (enabled) => {
    electron.app.isPackaged = false;
    applyLaunchAtLogin(enabled);
    expect(electron.app.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it.each([true, false])("preserves packaged stable behavior (enabled=%s)", (enabled) => {
    applyLaunchAtLogin(enabled);
    expect(electron.app.setLoginItemSettings).toHaveBeenCalledTimes(1);
    expect(electron.app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: enabled,
      args: ["--hidden"],
    });
  });

  it("keeps a native startup-setting failure from crashing a stable app", () => {
    const error = new Error("OS startup settings unavailable");
    electron.app.setLoginItemSettings.mockImplementation(() => { throw error; });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => applyLaunchAtLogin(true)).not.toThrow();
    expect(warn).toHaveBeenCalledWith("setLoginItemSettings failed", error);
  });
});
