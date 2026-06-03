// Vygeneruje jednoduché PWA ikony (zelené pozadie + biely kruh) bez závislostí.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

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

function makePng(size) {
  const bg = [22, 163, 74]; // brand-600
  const fg = [255, 255, 255];
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.28;

  const bytesPerPixel = 4;
  const rowLen = size * bytesPerPixel + 1; // +1 filter byte
  const raw = Buffer.alloc(rowLen * size);

  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const inCircle = dist <= r;
      const [rr, gg, bb] = inCircle ? fg : bg;
      const off = y * rowLen + 1 + x * bytesPerPixel;
      raw[off] = rr;
      raw[off + 1] = gg;
      raw[off + 2] = bb;
      raw[off + 3] = 255;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

for (const size of [192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), makePng(size));
  console.log(`icon-${size}.png`);
}
console.log("Hotovo.");
