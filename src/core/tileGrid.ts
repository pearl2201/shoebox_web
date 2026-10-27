export interface GridCandidate {
  offsetX: number;
  offsetY: number;
  columns: number;
  rows: number;
  quality: number;
  uniqueCount: number;
}

export interface TileRegion {
  x: number;
  y: number;
}

export interface TileGrid {
  offsetX: number;
  offsetY: number;
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  map: number[][];
  unique: TileRegion[];
}

function tileSignature(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  tileWidth: number,
  tileHeight: number,
  stepX: number,
  stepY: number,
): number {
  let hash = 0x811c9dc5;
  for (let sy = 0; sy < tileHeight; sy += stepY) {
    const row = ((y + sy) * width + x) * 4;
    for (let sx = 0; sx < tileWidth; sx += stepX) {
      const index = row + sx * 4;
      hash = Math.imul(hash ^ pixels[index], 0x01000193);
      hash = Math.imul(hash ^ pixels[index + 1], 0x01000193);
      hash = Math.imul(hash ^ pixels[index + 2], 0x01000193);
      hash = Math.imul(hash ^ pixels[index + 3], 0x01000193);
    }
  }
  return hash >>> 0;
}

/**
 * Scores every grid offset with
 * `Σ(tileCount²) × (cells − uniqueTiles)` (same idea as the legacy tool) using a
 * sampled tile signature so detection stays fast on large mock-ups.
 */
export function detectGrid(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tileWidth: number,
  tileHeight: number,
): GridCandidate {
  let best: GridCandidate | null = null;
  const stepX = Math.max(1, Math.floor(tileWidth / 8));
  const stepY = Math.max(1, Math.floor(tileHeight / 8));

  for (let offsetY = 0; offsetY < tileHeight; offsetY++) {
    const rows = Math.floor((height - offsetY) / tileHeight);
    if (rows < 2) continue;

    for (let offsetX = 0; offsetX < tileWidth; offsetX++) {
      const columns = Math.floor((width - offsetX) / tileWidth);
      if (columns < 2) continue;

      const counts = new Map<number, number>();
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const signature = tileSignature(
            pixels,
            width,
            offsetX + column * tileWidth,
            offsetY + row * tileHeight,
            tileWidth,
            tileHeight,
            stepX,
            stepY,
          );
          counts.set(signature, (counts.get(signature) ?? 0) + 1);
        }
      }

      let quality = 0;
      for (const count of counts.values()) quality += count * count;
      quality *= columns * rows - counts.size;

      if (
        !best ||
        quality > best.quality ||
        (quality === best.quality && counts.size < best.uniqueCount)
      ) {
        best = {
          offsetX,
          offsetY,
          columns,
          rows,
          quality,
          uniqueCount: counts.size,
        };
      }
    }
  }

  if (!best) {
    throw new Error('No tile grid found — the image must be at least two tiles wide and tall.');
  }

  return best;
}

function tileHash(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  tileWidth: number,
  tileHeight: number,
): number {
  let hash = 0x811c9dc5;
  const rowBytes = tileWidth * 4;

  for (let row = 0; row < tileHeight; row++) {
    let index = ((y + row) * width + x) * 4;
    const end = index + rowBytes;
    while (index < end) {
      hash = Math.imul(hash ^ pixels[index], 0x01000193);
      hash = Math.imul(hash ^ pixels[index + 1], 0x01000193);
      hash = Math.imul(hash ^ pixels[index + 2], 0x01000193);
      hash = Math.imul(hash ^ pixels[index + 3], 0x01000193);
      index += 4;
    }
  }

  return hash >>> 0;
}

function tilesEqual(
  pixels: Uint8ClampedArray,
  width: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tileWidth: number,
  tileHeight: number,
): boolean {
  const rowBytes = tileWidth * 4;
  for (let row = 0; row < tileHeight; row++) {
    let a = ((ay + row) * width + ax) * 4;
    let b = ((by + row) * width + bx) * 4;
    const end = a + rowBytes;
    while (a < end) {
      if (pixels[a] !== pixels[b]) return false;
      if (pixels[a + 1] !== pixels[b + 1]) return false;
      if (pixels[a + 2] !== pixels[b + 2]) return false;
      if (pixels[a + 3] !== pixels[b + 3]) return false;
      a += 4;
      b += 4;
    }
  }
  return true;
}

/** Exact pass: unique tiles and the tile index for every grid cell. */
export function buildTileGrid(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tileWidth: number,
  tileHeight: number,
  offsetX: number,
  offsetY: number,
): TileGrid {
  const columns = Math.floor((width - offsetX) / tileWidth);
  const rows = Math.floor((height - offsetY) / tileHeight);
  const buckets = new Map<number, number[]>();
  const unique: TileRegion[] = [];
  const map: number[][] = [];

  for (let row = 0; row < rows; row++) {
    const line: number[] = [];
    for (let column = 0; column < columns; column++) {
      const x = offsetX + column * tileWidth;
      const y = offsetY + row * tileHeight;
      const hash = tileHash(pixels, width, x, y, tileWidth, tileHeight);
      const candidates = buckets.get(hash) ?? [];

      let id = -1;
      for (const candidate of candidates) {
        const region = unique[candidate];
        if (tilesEqual(pixels, width, region.x, region.y, x, y, tileWidth, tileHeight)) {
          id = candidate;
          break;
        }
      }

      if (id === -1) {
        id = unique.length;
        unique.push({ x, y });
        candidates.push(id);
        buckets.set(hash, candidates);
      }

      line.push(id);
    }
    map.push(line);
  }

  return {
    offsetX,
    offsetY,
    columns,
    rows,
    tileWidth,
    tileHeight,
    map,
    unique,
  };
}
