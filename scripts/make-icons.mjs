// Generates resources/icon.png, resources/icon.ico and resources/tray.png without any image library.
// A PNG is drawn pixel by pixel (rounded square, accent gradient, contact silhouette) and the ICO
// simply wraps the 256px PNG, which Windows Vista+ supports.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "resources");
mkdirSync(out, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function encodePng(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// signed distance to a rounded rectangle centred at (cx, cy)
const sdRoundRect = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - hw + r;
  const dy = Math.abs(y - cy) - hh + r;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
};
const coverage = (d, aa) => clamp01(0.5 - d / aa);

function pixel(x, y, size) {
  const s = size;
  const aa = Math.max(1, s / 128);
  // background rounded square with a diagonal blue -> violet gradient
  const bg = coverage(sdRoundRect(x, y, s / 2, s / 2, s * 0.46, s * 0.46, s * 0.22), aa);
  const t = clamp01((x + y) / (2 * s));
  let r = mix(37, 109, t), g = mix(120, 73, t), b = mix(255, 255, t);
  // glossy highlight
  const gloss = clamp01(1 - y / (s * 0.5)) * 0.18;
  r = mix(r, 255, gloss); g = mix(g, 255, gloss); b = mix(b, 255, gloss);
  // contact silhouette: head + shoulders in white
  const head = coverage(Math.hypot(x - s / 2, y - s * 0.40) - s * 0.15, aa);
  const bodyD = sdRoundRect(x, y, s / 2, s * 0.86, s * 0.27, s * 0.22, s * 0.2);
  const body = coverage(bodyD, aa) * coverage(sdRoundRect(x, y, s / 2, s / 2, s * 0.46, s * 0.46, s * 0.22), aa);
  const white = clamp01(head + body);
  r = mix(r, 255, white * 0.96); g = mix(g, 255, white * 0.96); b = mix(b, 255, white * 0.96);
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(bg * 255)];
}

function trayPixel(x, y, size) {
  // Monochrome-friendly tray glyph: white silhouette on the accent disc.
  const s = size;
  const aa = 1;
  const disc = coverage(Math.hypot(x - s / 2, y - s / 2) - s * 0.48, aa);
  const head = coverage(Math.hypot(x - s / 2, y - s * 0.40) - s * 0.16, aa);
  const body = coverage(sdRoundRect(x, y, s / 2, s * 0.88, s * 0.28, s * 0.22, s * 0.2), aa) * disc;
  const white = clamp01(head + body);
  return [Math.round(mix(45, 255, white)), Math.round(mix(120, 255, white)), 255, Math.round(disc * 255)];
}

const png256 = encodePng(256, pixel);
writeFileSync(join(out, "icon.png"), png256);
writeFileSync(join(out, "tray.png"), encodePng(32, trayPixel));

// ICO: header + one directory entry pointing at the PNG payload
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0; // 256 x 256
entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png256.length, 8); entry.writeUInt32LE(6 + 16, 12);
writeFileSync(join(out, "icon.ico"), Buffer.concat([header, entry, png256]));
console.log("icons written to", out);
