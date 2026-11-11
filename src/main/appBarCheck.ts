/**
 * CI check (Windows): reserve a right-edge band with the real app-bar code and confirm Windows
 * shrinks the work area by the strip width, then gives it back on release. Run with
 * `electron out/main/appBarCheck.js`; exits non-zero on failure. Not loaded by the app itself.
 */
import { app, BrowserWindow, screen } from "electron";
import { DOCK_STRIP_WIDTH } from "@shared/defaults";
import { releaseAppBar, reservedBand, shellTaskbarPresent, syncAppBar } from "./appBar";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fail = (msg: string) => {
  console.error(`App bar check failed: ${msg}`);
  app.exit(1);
};

app.whenReady().then(async () => {
  setTimeout(() => fail("timed out"), 30_000);
  if (process.platform !== "win32") {
    console.log("App bar check: not Windows, skipped.");
    return app.exit(0);
  }
  const display = screen.getPrimaryDisplay();
  const before = { ...display.workArea };
  const win = new BrowserWindow({ ...display.workArea, width: DOCK_STRIP_WIDTH, frame: false, skipTaskbar: true, show: true });
  const reserved = await syncAppBar(win, { enabled: true, side: "right" }, () => undefined);
  if (!reserved) return fail("Windows refused the app bar registration");
  const band = reservedBand();
  if (!band || Math.abs(band.width - DOCK_STRIP_WIDTH) > 2) return fail(`unexpected band ${JSON.stringify(band)}`);
  const shell = await shellTaskbarPresent();
  await wait(1500);
  const during = { ...screen.getPrimaryDisplay().workArea };
  console.log("work area before", before, "while reserved", during, "band", band, "shell", shell);
  if (shell && Math.abs(before.width - during.width - DOCK_STRIP_WIDTH) > 2) return fail("the work area did not shrink by the strip width");
  releaseAppBar();
  await wait(1500);
  const after = { ...screen.getPrimaryDisplay().workArea };
  console.log("work area after release", after);
  if (shell && after.width !== before.width) return fail("the work area was not restored after release");
  if (!shell) console.log("No Windows shell on this machine: registration checked, work-area change skipped.");
  console.log("App bar check passed.");
  app.exit(0);
});
