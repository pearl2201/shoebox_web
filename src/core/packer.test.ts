import { describe, expect, it } from 'vitest';
import { pack, tryPack, type PackItem } from './packer';

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
