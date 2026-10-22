// Genera los iconos PNG de la PWA sin dependencias: cuadrado verde con la "bandeja" del logo.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [13, 107, 99];
const FG = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, inside) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const S = 4; // supermuestreo para bordes suaves
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const u = (x + (sx + .5) / S) / size, v = (y + (sy + .5) / S) / size;
        const r = inside(u, v);
        if (r === 2) fg++; else if (r === 1) bg++;
      }
      const n = S * S, a = (bg + fg) / n, f = fg / Math.max(1, bg + fg);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] * (1 - f) + FG[i] * f);
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function roundRect(u, v, x0, y0, x1, y1, r) {
  if (u < x0 || u > x1 || v < y0 || v > y1) return false;
  const cx = Math.min(Math.max(u, x0 + r), x1 - r), cy = Math.min(Math.max(v, y0 + r), y1 - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}
// Bandeja: un rectángulo abierto por arriba, como en el logo de la app
function tray(u, v, pad) {
  const s = 1 - pad * 2, map = (t) => (t - pad) / s;
  const x = map(u), y = map(v);
  const L = 0.3, R = 0.7, T = 0.32, B = 0.7, W = 0.075;
  const inOuter = x >= L && x <= R && y >= T && y <= B;
  const inInner = x >= L + W && x <= R - W && y >= T - 1 && y <= B - W;
  return inOuter && !inInner;
}
function icon(size, { maskable = false } = {}) {
  return png(size, (u, v) => {
    const inBg = maskable ? true : roundRect(u, v, 0, 0, 1, 1, 0.22);
    if (!inBg) return 0;
    return tray(u, v, maskable ? 0.1 : 0) ? 2 : 1;
  });
}
writeFileSync('public/icons/icon-192.png', icon(192));
writeFileSync('public/icons/icon-512.png', icon(512));
writeFileSync('public/icons/icon-maskable-512.png', icon(512, { maskable: true }));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, { maskable: true }));
writeFileSync('app/icon.png', icon(64));
for (const n of [16, 32, 48, 128]) writeFileSync(`extension/icons/icon${n}.png`, icon(n));
console.log('Iconos generados');
