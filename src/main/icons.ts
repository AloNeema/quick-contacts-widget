import { nativeImage } from "electron";
import path from "node:path";

function iconPath(file: string): string | undefined {
  const candidates = [path.join(process.resourcesPath, file), path.join(__dirname, "../../resources", file)];
  return candidates.find((p) => !nativeImage.createFromPath(p).isEmpty());
}

export function windowIcon(): string | undefined {
  return iconPath("icon.png");
}

export function trayIcon(): Electron.NativeImage | string {
  // A multi-size ICO path lets Windows choose the correct size for display scaling.
  if (process.platform === "win32") {
    const file = iconPath("tray.ico");
    if (file) return file;
  }
  const file = iconPath(process.platform === "darwin" ? "trayTemplate.png" : "tray.png") ?? windowIcon();
  if (!file) return nativeImage.createEmpty();
  const img = nativeImage.createFromPath(file);
  const sized = img.resize({ width: 16, height: 16 });
  sized.addRepresentation({ scaleFactor: 2, buffer: img.resize({ width: 32, height: 32 }).toPNG() });
  if (process.platform === "darwin") sized.setTemplateImage(true);
  return sized;
}
