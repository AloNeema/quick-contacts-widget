/* Checks actual Chromium-computed CSS without opening the user's app profile. */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "qcf-appearance-check-")));
app.disableHardwareAcceleration();
const timeout = setTimeout(() => { console.error("Appearance check timed out"); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const assets = path.join(__dirname, "../out/renderer/assets");
  const css = fs.readdirSync(assets).filter(name => name.endsWith(".css"))
    .map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");
  assert.ok(css.includes("glass-panel"), "Compiled widget CSS must be present");
  const win = new BrowserWindow({ show: false, width: 400, height: 600, webPreferences: { contextIsolation: true, sandbox: true } });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    '<html><head><style>' + css + '</style></head><body><div class="glass-panel">Panel</div><div class="dock-strip">Dock</div><div class="menu-glass">Options</div><div class="detail-card">Email</div></body></html>'
  ));
  const results = await win.webContents.executeJavaScript(`(() => {
    const alpha = value => {
      const numbers = value.match(/[\\d.]+/g)?.map(Number) ?? [];
      return numbers.length === 4 ? numbers[3] : numbers.length === 3 ? 1 : 0;
    };
    const results = [];
    for (const theme of ["dark", "light"]) {
      for (const acrylic of ["true", "false"]) {
        for (const opacity of ["0.2", "0.38", "0.86", "0.9", "1"]) {
          document.documentElement.dataset.theme = theme;
          document.body.dataset.acrylic = acrylic;
          document.documentElement.style.setProperty("--panel-opacity", opacity);
          results.push({
            theme, acrylic, opacity,
            panel: alpha(getComputedStyle(document.querySelector(".glass-panel")).backgroundColor),
            gradient: getComputedStyle(document.querySelector(".glass-panel")).backgroundImage,
            dock: alpha(getComputedStyle(document.querySelector(".dock-strip")).backgroundColor),
            menu: alpha(getComputedStyle(document.querySelector(".menu-glass")).backgroundColor),
            detail: alpha(getComputedStyle(document.querySelector(".detail-card")).backgroundColor),
          });
        }
      }
    }
    return results;
  })()`);
  for (const row of results) {
    const context = JSON.stringify(row);
    assert.ok(row.panel >= 0.85, "Readable panel background: " + context);
    assert.ok(row.dock >= 0.85, "Readable dock background: " + context);
    assert.notEqual(row.gradient, "none", "Valid panel gradient: " + context);
    assert.equal(row.menu, 1, "Opaque menu: " + context);
    assert.equal(row.detail, 1, "Opaque email/deal card: " + context);
    if (row.opacity === "1") assert.equal(row.panel, 1, "Full-opacity setting: " + context);
  }
  console.log("Appearance check passed: " + results.length + " dark/light, acrylic and legacy-opacity combinations.");
  win.destroy();
  clearTimeout(timeout);
  app.exit(0);
}).catch(error => {
  console.error(error);
  clearTimeout(timeout);
  app.exit(1);
});
