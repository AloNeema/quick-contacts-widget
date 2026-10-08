import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { graphEntryIdToHex, OUTLOOK_DESKTOP_SCRIPT } from "./outlookDesktop";

describe("Graph-to-Classic-Outlook message IDs", () => {
  it("decodes URL-safe MAPI entry IDs with zero, one or two padding characters", () => {
    for (const hex of ["FF", "FFEE", "FFEEDD", "0001020304050607", "FBEFFF"]) {
      const raw = Buffer.from(hex, "hex").toString("base64");
      const count = raw.length - raw.replace(/=+$/, "").length;
      const encoded = raw.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_") + count;
      expect(graphEntryIdToHex(encoded)).toBe(hex);
    }
  });
  it("rejects malformed or truncated IDs instead of opening the wrong message", () => {
    for (const value of ["", "abc", "abc9", "a0", "bad id0", "====2", "AB2", "x".repeat(9000) + "0"]) {
      expect(() => graphEntryIdToHex(value)).toThrow();
    }
  });
  it.runIf(process.platform === "win32")("parses the Outlook helper in Windows PowerShell without running it", () => {
    const parser = "$errors = $null; $tokens = $null; [void][System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(), [ref]$tokens, [ref]$errors); if ($errors.Count) { $errors | ForEach-Object { Write-Output $_.Message }; exit 1 }; exit 0";
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", parser], {
      input: OUTLOOK_DESKTOP_SCRIPT, encoding: "utf8", windowsHide: true, timeout: 15000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
