// electron-builder afterPack hook: ad-hoc sign the macOS app when no Developer ID is configured.
//
// With `identity: null` electron-builder skips signing, but it has already edited Electron's
// Info.plist, which breaks Electron's own signature. Apple Silicon refuses to run code with an
// invalid signature, so the app silently fails to open. An ad-hoc signature ("-") is free and
// makes the bundle valid again. A real Developer ID (CSC_LINK) replaces this and adds notarization.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSignMac(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], { stdio: "inherit" });
};
