export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function fullRect(width: number, height: number): Rect {
  return { x: 0, y: 0, width, height };
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Finds the tight bounds of pixels whose alpha exceeds `threshold`.
 * Returns null for a fully transparent image.
 */
export function alphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 0,
): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    let rowHasContent = false;

    for (let x = 0; x < width; x++) {
      if (data[rowStart + x * 4 + 3] > threshold) {
        rowHasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }

    if (rowHasContent) {
      if (y < minY) minY = y;
      maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Copies a sub-rectangle out of RGBA pixel data. */
export function cropPixels(
  data: Uint8ClampedArray,
  width: number,
  bounds: Rect,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  const rowBytes = bounds.width * 4;

  for (let y = 0; y < bounds.height; y++) {
    const srcStart = ((bounds.y + y) * width + bounds.x) * 4;
    out.set(data.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
  }

  return out;
}

/** FNV-1a over RGBA bytes — used for a fast duplicate pre-check. */
export function hashPixels(data: Uint8ClampedArray): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 4) {
    hash = Math.imul(hash ^ data[i], 0x01000193);
    hash = Math.imul(hash ^ data[i + 1], 0x01000193);
    hash = Math.imul(hash ^ data[i + 2], 0x01000193);
    hash = Math.imul(hash ^ data[i + 3], 0x01000193);
  }
  return hash >>> 0;
}

export function pixelsEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
