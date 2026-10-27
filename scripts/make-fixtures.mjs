import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = join(process.cwd(), '.tmp-fixtures');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuffer, data]);
  const out = Buffer.alloc(4 + body.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 4 + body.length);
  return out;
}

function makePng(width, height, pixel) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const offset = rowStart + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(name, buffer) {
  const path = join(OUT, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
  console.log(`wrote ${name} (${buffer.length} bytes)`);
}

const hero = makePng(64, 64, (x, y) =>
  x >= 8 && x < 56 && y >= 8 && y < 56 ? [124, 242, 155, 255] : [0, 0, 0, 0],
);
write('hero.png', hero);
write('hero-copy.png', hero);

write(
  'coin.png',
  makePng(32, 48, (x, y) =>
    Math.abs(x - 16) + Math.abs(y - 24) < 15 ? [108, 199, 255, 255] : [0, 0, 0, 0],
  ),
);

write(
  'tiles.png',
  makePng(128, 96, (x, y) => {
    const cellX = Math.floor(x / 32);
    const cellY = Math.floor(y / 32);
    const inX = x % 32;
    const inY = y % 32;
    const inset = inX >= 4 && inX < 28 && inY >= 4 && inY < 28;
    if (!inset) return [0, 0, 0, 0];
    const colors = [
      [124, 242, 155, 255],
      [108, 199, 255, 255],
      [255, 122, 144, 255],
      [255, 212, 121, 255],
    ];
    return colors[(cellY * 4 + cellX) % colors.length];
  }),
);
