// Vygeneruje PWA ikony s Rypákom bez závislostí (čistý PNG encoder + geometria).
// Maskot je zložený z elíps a trojuholníkov, takže sa dá rastrovať testom
// „bod v tvare“ s jemným vyhladením hrán (supersampling 3×3).
//
//   icon-192.png, icon-512.png   – bežná ikona (krémové pozadie, prasa, tušový rám)
//   maskable-512.png             – maskable: väčší okraj (bezpečná zóna 80 %)
//   apple-touch-icon.png (180)   – iOS plocha
//   badge-96.png                 – monochromatický odznak notifikácií (biela silueta)
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const PAPER = [0xf6, 0xee, 0xdc];
const INK = [0x1b, 0x1a, 0x17];
const PIG = [0xf2, 0xa3, 0xb3];
const DEEP = [0xe3, 0x6f, 0x8c];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(size, pixel) {
  const rowLen = size * 4 + 1;
  const raw = Buffer.alloc(rowLen * size);
  const SS = 3; // supersampling
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb, pa] = pixel((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      }
      const n = SS * SS;
      const off = y * rowLen + 1 + x * 4;
      if (a > 0) {
        raw[off] = Math.round(r / a); raw[off + 1] = Math.round(g / a); raw[off + 2] = Math.round(b / a);
      }
      raw[off + 3] = Math.round((a / n) * 255);
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Geometria v jednotkovom štvorci (0..1), prasa v strede. Súradnice zodpovedajú
// SVG komponentu Pig.tsx (viewBox 200×180) zmenšenému do štvorca.
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// Vráti farbu prasaťa v bode (u, v) po transformácii do „prasacieho“ priestoru
// 200×180 (center 100,100), alebo null mimo neho. `scale` = koľko z plochy zaberá.
function pigColor(u, v, scale, mono) {
  const X = (u - 0.5) * (200 / scale) + 100;
  const Y = (v - 0.5) * (200 / scale) + 100;
  const inkC = mono ? WHITE : INK;
  const pigC = mono ? WHITE : PIG;
  const deepC = mono ? WHITE : DEEP;

  const headIn = inEllipse(X, Y, 100, 100, 70, 62);
  const headOut = inEllipse(X, Y, 100, 100, 73, 65);
  const earL = inTriangle(X, Y, [44, 74], [46, 22], [86, 56]);
  const earR = inTriangle(X, Y, [156, 74], [154, 22], [114, 56]);
  const earLOut = inTriangle(X, Y, [41, 78], [44, 16], [90, 56]);
  const earROut = inTriangle(X, Y, [159, 78], [156, 16], [110, 56]);

  if (headIn) {
    if (!mono) {
      // oči
      if (inEllipse(X, Y, 74, 90, 7, 7) || inEllipse(X, Y, 126, 90, 7, 7)) return inkC;
      // obočie (podozrievavé – ikonický výraz Rypáka)
      if (Y > 66 && Y < 72 && X > 60 && X < 88 && Math.abs(Y - (70 - (X - 60) * 0.15)) < 2.2) return inkC;
      if (Y > 73 && Y < 80 && X > 116 && X < 140 && Math.abs(Y - 77) < 2) return inkC;
      // rypák
      if (inEllipse(X, Y, 90, 124, 4.5, 6.5) || inEllipse(X, Y, 110, 124, 4.5, 6.5)) return inkC;
      if (inEllipse(X, Y, 100, 124, 28, 19) && !inEllipse(X, Y, 100, 124, 25.5, 16.5)) return inkC;
      if (inEllipse(X, Y, 100, 124, 28, 19)) return deepC;
      // ústa – rovná čiara
      if (Y > 151 && Y < 155 && X > 84 && X < 116) return inkC;
      // líca
      if (inEllipse(X, Y, 50, 114, 9, 9) || inEllipse(X, Y, 150, 114, 9, 9)) return [0xf7, 0xc1, 0xcc];
    }
    return pigC;
  }
  if (headOut) return inkC; // obrys hlavy
  if (earL || earR) {
    if (!mono && (inTriangle(X, Y, [52, 64], [56, 34], [76, 56]) || inTriangle(X, Y, [148, 64], [144, 34], [124, 56]))) return deepC;
    return pigC;
  }
  if (earLOut || earROut) return inkC;
  return null;
}

function iconPixel(size, { maskable = false, mono = false, bg = true } = {}) {
  return (u, v) => {
    const scale = maskable ? 0.62 : 0.84;
    const c = pigColor(u, v, scale, mono);
    if (c) return [...c, 1];
    if (!bg) return [0, 0, 0, 0];
    // rám z tuša okolo ikony (nie pri maskable – systém si ikonu oreže sám)
    const m = 0.045;
    if (!maskable && (u < m || v < m || u > 1 - m || v > 1 - m)) return [...INK, 1];
    return [...PAPER, 1];
  };
}

const jobs = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, {}],
  ["badge-96.png", 96, { mono: true, bg: false }],
];
for (const [name, size, opts] of jobs) {
  writeFileSync(join(outDir, name), encodePng(size, iconPixel(size, opts)));
  console.log(name);
}
console.log("Hotovo.");
