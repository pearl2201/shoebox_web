import { describe, expect, it } from 'vitest';
import { pack, packPages, tryPack, type PackItem } from './packer';

function item(id: string, width: number, height: number, sourceIndex: number): PackItem {
  return { id, width, height, sourceIndex };
}

function paddedBoxes(result: ReturnType<typeof pack>) {
  return result.items.map((entry) => ({
    x: entry.x,
    y: entry.y,
    width: entry.width,
    height: entry.height,
    id: entry.id,
  }));
}

describe('pack', () => {
  it('places every sprite without overlap and inside the sheet', () => {
    const items = [
      item('a', 64, 64, 0),
      item('b', 32, 128, 1),
      item('c', 128, 32, 2),
      item('d', 16, 16, 3),
    ];

    const result = pack(items, { padding: 2, powerOfTwo: false, maxSize: 4096 });
    const boxes = paddedBoxes(result);

    expect(boxes).toHaveLength(items.length);

    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(result.width);
      expect(box.y + box.height).toBeLessThanOrEqual(result.height);
    }

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = a.x < b.x + b.width && b.x < a.x + a.width;
        const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('produces power-of-two dimensions', () => {
    const result = pack([item('a', 100, 40, 0), item('b', 80, 60, 1)], {
      padding: 0,
      powerOfTwo: true,
      maxSize: 4096,
    });

    expect(result.width).toBe(result.height);
    expect(Number.isInteger(Math.log2(result.width))).toBe(true);
  });

  it('keeps at least the padding between sprite boxes', () => {
    const padding = 4;
    const result = pack(
      [item('a', 20, 20, 0), item('b', 20, 20, 1), item('c', 20, 20, 2)],
      { padding, powerOfTwo: false, maxSize: 256 },
    );

    for (let i = 0; i < result.items.length; i++) {
      for (let j = i + 1; j < result.items.length; j++) {
        const a = result.items[i];
        const b = result.items[j];
        const gapX = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
        const gapY = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(padding);
      }
    }
  });

  it('keeps the original item ids and source indices', () => {
    const result = pack([item('hero', 10, 10, 7)], {
      padding: 0,
      powerOfTwo: true,
      maxSize: 64,
    });

    expect(result.items[0].id).toBe('hero');
    expect(result.items[0].sourceIndex).toBe(7);
  });

  it('rejects sprites larger than the configured limit', () => {
    expect(() =>
      pack([item('big', 300, 300, 0)], { padding: 0, powerOfTwo: true, maxSize: 256 }),
    ).toThrow(/exceeds/i);
  });

  it('reports failure when sprites cannot fit', () => {
    expect(tryPack([item('a', 80, 80, 0), item('b', 80, 80, 1)], 0, 100, 100)).toBeNull();
  });

  it('refuses to pack an empty list', () => {
    expect(() => pack([], { padding: 0, powerOfTwo: true, maxSize: 256 })).toThrow();
  });
});

describe('packPages', () => {
  it('keeps everything on one page when it fits', () => {
    const items = [item('a', 64, 64, 0), item('b', 32, 32, 1)];
    const options = { padding: 2, powerOfTwo: true, maxSize: 1024 };

    const pages = packPages(items, options);

    expect(pages).toHaveLength(1);
    expect(pages[0].index).toBe(0);
    expect(pages[0]).toEqual({ ...pack(items, options), index: 0 });
  });

  it('spills onto another page when the sheet limit is reached', () => {
    // 8 sprites of 100×100 with padding 0 need a 400px square; the limit is 256.
    const items = Array.from({ length: 8 }, (_, index) => item(`s${index}`, 100, 100, index));
    const options = { padding: 0, powerOfTwo: true, maxSize: 256 };

    const pages = packPages(items, options);

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(Math.max(page.width, page.height)).toBeLessThanOrEqual(256);
    }
  });

  it('places every sprite exactly once across all pages', () => {
    const items = Array.from({ length: 10 }, (_, index) =>
      item(`s${index}`, 60 + index * 4, 40 + index * 2, index),
    );
    const pages = packPages(items, { padding: 2, powerOfTwo: true, maxSize: 256 });

    const placed = pages.flatMap((page) => page.items.map((entry) => entry.sourceIndex));
    expect(placed).toHaveLength(items.length);
    expect(new Set(placed).size).toBe(items.length);
    expect(new Set(placed)).toEqual(new Set(items.map((entry) => entry.sourceIndex)));
  });

  it('keeps sprites inside their page', () => {
    const items = Array.from({ length: 6 }, (_, index) => item(`s${index}`, 90, 70, index));
    const pages = packPages(items, { padding: 4, powerOfTwo: false, maxSize: 300 });

    for (const page of pages) {
      for (const entry of page.items) {
        expect(entry.x + entry.width).toBeLessThanOrEqual(page.width);
        expect(entry.y + entry.height).toBeLessThanOrEqual(page.height);
      }
    }
  });

  it('reports a sprite that cannot fit at all', () => {
    expect(() =>
      packPages([item('big', 400, 400, 0)], { padding: 0, powerOfTwo: true, maxSize: 256 }),
    ).toThrow(/cannot fit/i);
  });

  it('returns no pages for an empty list', () => {
    expect(packPages([], { padding: 0, powerOfTwo: true, maxSize: 256 })).toEqual([]);
  });
});
