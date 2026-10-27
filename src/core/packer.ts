/**
 * Guillotine sprite packer.
 *
 * Port of the binary-tree packer used by the original ShoeBox
 * (`PluginCreateSpriteSheet.build_tree`, itself based on Nate W. Moore's
 * `rect_packing.py`). Behaviour kept for output parity:
 *
 *  - rectangles are sorted by `width + height` descending
 *  - free space is split into two nodes, choosing the split direction by
 *    which remaining side is larger
 *  - power-of-two mode picks the first square size that fits
 *  - non power-of-two mode binary-searches a square, then shrinks height and
 *    width independently
 *  - `padding` is spacing only: it grows the packed box but the blit size
 *    stays the original sprite size
 */

export interface PackItem {
  id: string;
  sourceIndex: number;
  width: number;
  height: number;
}

export interface PackedItem extends PackItem {
  x: number;
  y: number;
}

export interface PackOptions {
  padding: number;
  powerOfTwo: boolean;
  maxSize: number;
}

export interface PackResult {
  width: number;
  height: number;
  items: PackedItem[];
}

const POT_SIZES = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192];

interface Node {
  w: number;
  h: number;
}

function sortForPacking(items: PackItem[], padding: number) {
  return items
    .map((item) => ({
      item,
      pw: item.width + padding,
      ph: item.height + padding,
    }))
    .sort((a, b) => {
      const bySum = b.pw + b.ph - (a.pw + a.ph);
      if (bySum !== 0) return bySum;
      return b.pw * b.ph - a.pw * a.ph;
    });
}

/**
 * Attempts to place every item inside `width × height`.
 * Returns null when at least one item does not fit.
 */
export function tryPack(
  items: PackItem[],
  padding: number,
  width: number,
  height: number,
): PackedItem[] | null {
  const queue = sortForPacking(items, padding);
  const placed: PackedItem[] = [];

  const split = (x: number, y: number, free: Node) => {
    if (free.w <= 0 || free.h <= 0 || queue.length === 0) return;

    let index = -1;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].pw <= free.w && queue[i].ph <= free.h) {
        index = i;
        break;
      }
    }
    if (index === -1) return;

    const entry = queue.splice(index, 1)[0];
    placed.push({ ...entry.item, x, y });

    // Same split heuristic as the legacy implementation.
    if (free.w - entry.ph > free.h - entry.pw) {
      split(x, y + entry.ph, { w: entry.pw, h: free.h - entry.ph });
      split(x + entry.pw, y, { w: free.w - entry.pw, h: free.h });
    } else {
      split(x + entry.pw, y, { w: free.w - entry.pw, h: entry.ph });
      split(x, y + entry.ph, { w: free.w, h: free.h - entry.ph });
    }
  };

  split(0, 0, { w: width, h: height });
  return queue.length === 0 ? placed : null;
}

function binarySearchSize(
  low: number,
  high: number,
  fits: (size: number) => boolean,
): number | null {
  let best: number | null = null;
  let lo = low;
  let hi = high;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return best;
}

export function pack(items: PackItem[], options: PackOptions): PackResult {
  if (items.length === 0) throw new Error('Nothing to pack.');

  const padding = Math.max(0, Math.floor(options.padding));
  const maxSize = Math.max(32, Math.min(8192, Math.floor(options.maxSize)));

  const widest = Math.max(...items.map((item) => item.width + padding));
  const tallest = Math.max(...items.map((item) => item.height + padding));
  const minimumSide = Math.max(widest, tallest);

  if (minimumSide > maxSize) {
    throw new Error(
      `A sprite needs ${widest}×${tallest}px, which exceeds the ${maxSize}px limit. Raise "Max sheet size".`,
    );
  }

  if (options.powerOfTwo) {
    for (const size of POT_SIZES) {
      if (size < minimumSide || size > maxSize) continue;
      const placed = tryPack(items, padding, size, size);
      if (placed) return { width: size, height: size, items: placed };
    }
    throw new Error(
      `Sprites do not fit in a ${maxSize}px power-of-two atlas. Raise the limit or split the set.`,
    );
  }

  const square = binarySearchSize(minimumSide, maxSize, (size) =>
    tryPack(items, padding, size, size) !== null,
  );
  if (square === null) {
    throw new Error(`Sprites do not fit in ${maxSize}px. Raise the limit or split the set.`);
  }

  let height = square;
  const shorter = binarySearchSize(tallest, square, (candidate) =>
    tryPack(items, padding, square, candidate) !== null,
  );
  if (shorter !== null) height = shorter;

  let width = square;
  const narrower = binarySearchSize(widest, square, (candidate) =>
    tryPack(items, padding, candidate, height) !== null,
  );
  if (narrower !== null) width = narrower;

  const finalItems = tryPack(items, padding, width, height) ?? tryPack(items, padding, square, square);
  if (!finalItems) throw new Error('Packing failed unexpectedly.');

  // For a non power-of-two atlas the sheet is trimmed to the used area.
  const usedWidth = Math.max(...finalItems.map((item) => item.x + item.width));
  const usedHeight = Math.max(...finalItems.map((item) => item.y + item.height));

  return { width: usedWidth, height: usedHeight, items: finalItems };
}

/**
 * Pages produced by `packPages`: each one is a complete sheet.
 */
export interface PackPage extends PackResult {
  index: number;
}

const MAX_PAGES = 64;

/**
 * Packs a set that does not have to fit on a single sheet.
 *
 * Items are consumed largest-first and every page is packed exactly like
 * `pack()` would pack it, so a single page result is identical to calling
 * `pack()` directly. When the remaining sprites no longer fit in `maxSize`,
 * the largest prefix that still fits becomes a page and the rest continue on
 * the next one.
 */
export function packPages(items: PackItem[], options: PackOptions): PackPage[] {
  if (items.length === 0) return [];

  const oversized = items.find(
    (item) => item.width > options.maxSize || item.height > options.maxSize,
  );
  if (oversized) {
    throw new Error(
      `“${oversized.id}” is ${oversized.width}×${oversized.height}px and cannot fit in a ${options.maxSize}px sheet. Raise the limit or scale the sprite down.`,
    );
  }

  // Largest area first keeps page fill even and mirrors `sortForPacking()`.
  const remaining = [...items].sort((a, b) => {
    const byArea = b.width * b.height - a.width * a.height;
    return byArea !== 0 ? byArea : a.id.localeCompare(b.id);
  });

  const pages: PackPage[] = [];

  while (remaining.length > 0) {
    if (pages.length >= MAX_PAGES) {
      throw new Error(`Sprites need more than ${MAX_PAGES} pages. Split the set or raise the sheet size.`);
    }

    const count = largestFittingPrefix(remaining, options);
    if (count === 0) {
      throw new Error(
        `“${remaining[0].id}” does not fit in a ${options.maxSize}px sheet. Raise the limit or scale the sprite down.`,
      );
    }

    const page = pack(remaining.slice(0, count), options);
    pages.push({ ...page, index: pages.length });
    remaining.splice(0, count);
  }

  return pages;
}

/**
 * Longest prefix of `items` that still packs into one sheet. `pack()` is
 * monotone in the item count, so a binary search is safe.
 */
function largestFittingPrefix(items: PackItem[], options: PackOptions): number {
  let low = 1;
  let high = items.length;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    let fits = true;
    try {
      pack(items.slice(0, mid), options);
    } catch {
      fits = false;
    }

    if (fits) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

