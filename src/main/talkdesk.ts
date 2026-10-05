import http from "node:http";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { DialerError, fillPhoneTemplate } from "@shared/dialer";

const TTL = 10 * 60 * 1000;

/** Only a number is held in memory; no contacts are uploaded or included in the browser URL. */
export class TalkdeskHandoff {
  private server: http.Server | undefined;
  private starting: Promise<void> | undefined;
  private base = "";
  private tickets = new Map<string, { phone: string; expires: number }>();
  constructor(private now: () => number = Date.now) {}

  private start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = new Promise<void>((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        if (req.method !== "GET" || req.headers.host !== this.base.slice(7) ||
            (req.headers.origin && req.headers.origin !== this.base) || req.headers["sec-fetch-site"] === "cross-site") {
          res.writeHead(403); res.end("Unavailable"); return;
        }
        const ticket = this.tickets.get(req.url ?? "");
        if (!ticket || ticket.expires <= this.now()) {
          this.tickets.delete(req.url ?? "");
          res.writeHead(410, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("This calling page has expired. Click Call in QCF Contacts to open a new one."); return;
        }
        const nonce = randomBytes(18).toString("base64");
        res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        // phone is validated as digits with a leading + before it ever reaches this template.
        res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Call with Talkdesk · QCF Contacts</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#eef3fb;color:#142138;font:16px/1.6 system-ui,sans-serif}main{max-width:600px;margin:9vh auto;padding:36px;background:#fff;border:1px solid #dbe3ef;border-radius:24px;box-shadow:0 18px 60px #203b6610}small{color:#426293}h1{font-size:28px;line-height:1.2}.phone{display:block;font-size:34px;font-weight:700;letter-spacing:.02em;color:#185cce;margin:24px 0;overflow-wrap:anywhere}button{background:#e8effa;color:#1850a0;border:0;border-radius:10px;padding:12px 18px;font:inherit;cursor:pointer}a{color:#185cce}.note{font-size:14px;color:#54647a}#status{min-height:26px}@media(max-width:640px){main{margin:24px 16px;padding:24px}}</style>
<main><small>QCF CONTACTS · TALKDESK PILOT</small><h1>Call with Talkdesk</h1><p>Use the Talkdesk extension beside this number, or select the number, right-click and choose Talkdesk's Call option.</p><span class="phone" id="phone">${ticket.phone}</span><button id="copy" type="button">Copy number</button><p id="status" role="status"></p><p>Keep Workspace Desktop running and signed in. Finish any active call first.</p><p class="note">No Talkdesk option? Use the Chrome profile with your company extension and allow the extension on this page. <a href="https://support.talkdesk.com/hc/en-us/articles/204965789-Installing-Talkdesk-Click-to-Call-Extension" target="_blank" rel="noreferrer noopener">Setup help</a></p><p class="note">Opening this page does not place a call or mark the contact as reached. The page expires after 10 minutes.</p></main>
<script nonce="${nonce}">const expires=${ticket.expires};const expired=()=>{if(Date.now()<expires)return false;document.querySelector('main').textContent='This calling page has expired. Click Call in QCF Contacts to open a new one.';return true;};document.getElementById('copy').addEventListener('click',async()=>{if(expired())return;try{await navigator.clipboard.writeText(document.getElementById('phone').textContent);document.getElementById('status').textContent='Number copied. Paste it into Talkdesk.';}catch{document.getElementById('status').textContent='Select the number and press Ctrl+C to copy.';}});window.addEventListener('pageshow',expired);setTimeout(expired,Math.max(0,expires-Date.now()));</script></html>`);
      });
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        const address = this.server!.address();
        if (!address || typeof address === "string") { reject(new Error("Could not open calling page")); return; }
        this.base = `http://127.0.0.1:${address.port}`;
        this.server!.unref();
        resolve();
      });
    }).catch(err => { this.starting = undefined; throw err; });
    return this.starting;
  }

  async create(phone: string): Promise<string> {
    fillPhoneTemplate("{e164}", phone);
    await this.start();
    for (const [key, ticket] of this.tickets) if (ticket.expires <= this.now()) this.tickets.delete(key);
    while (this.tickets.size >= 20) this.tickets.delete(this.tickets.keys().next().value!);
    const key = `/call/${randomBytes(32).toString("hex")}`;
    this.tickets.set(key, { phone, expires: this.now() + TTL });
    return this.base + key;
  }

  async close(): Promise<void> {
    await this.starting?.catch(() => undefined);
    this.tickets.clear();
    if (this.server) {
      this.server.closeAllConnections();
      await new Promise<void>(resolve => this.server!.close(() => resolve()));
    }
    this.server = undefined; this.starting = undefined; this.base = "";
  }
}

async function chromePath(): Promise<string> {
  const candidates = process.platform === "win32"
    ? [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter((p): p is string => Boolean(p)).map(p => path.join(p, "Google/Chrome/Application/chrome.exe"))
    : process.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];
  for (const candidate of candidates) { try { await access(candidate); return candidate; } catch { /* next standard installation */ } }
  throw new DialerError("Google Chrome was not found. Install Chrome with your company's Talkdesk extension to use this pilot.");
}

export const talkdeskHandoff = new TalkdeskHandoff();

export async function openTalkdeskCall(phone: string): Promise<void> {
  const executable = await chromePath();
  const url = await talkdeskHandoff.create(phone);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [url], { detached: true, stdio: "ignore", windowsHide: true, shell: false });
    child.once("error", () => reject(new DialerError("Chrome could not open. Check your company's Chrome installation.")));
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}
