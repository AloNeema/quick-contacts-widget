import { execFile } from "node:child_process";
import path from "node:path";
import { graphEntryIdToHex, OUTLOOK_DESKTOP_SCRIPT } from "@shared/outlookDesktop";

/** Opens an existing message or a reply editor. Never sends email. */
export async function openInClassicOutlook(entryId: string, addresses: string[], action: "open" | "reply" | "replyAll"): Promise<void> {
  if (process.platform !== "win32") throw new Error("Classic Outlook opening is supported on Windows.");
  const request = { entryId: graphEntryIdToHex(entryId), addresses: addresses.map(a => a.toLowerCase()), action };
  if (!request.addresses.length) throw new Error("Could not identify the signed-in mailbox.");
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  await new Promise<void>((resolve, reject) => {
    const child = execFile(executable, ["-NoProfile", "-NonInteractive", "-STA", "-Command", OUTLOOK_DESKTOP_SCRIPT],
      { windowsHide: true, timeout: 25_000, maxBuffer: 16 * 1024 },
      error => error
        ? reject(new Error("Could not open Classic Outlook. Open it with the same Microsoft account, then retry. You can also choose Open email in browser from the three-dot menu."))
        : resolve());
    child.stdin?.on("error", () => { /* Process completion reports launch/pipe failures. */ });
    child.stdin?.end(JSON.stringify(request));
  });
}
