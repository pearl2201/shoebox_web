import { describe, expect, it } from 'vitest';
import { alphaBounds, cropPixels, hashPixels, pixelsEqual } from './alpha';

function rgba(width: number, height: number, filled: [number, number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha] of filled) {
    data[(y * width + x) * 4 + 3] = alpha;
    data[(y * width + x) * 4 + 0] = 255;
  }
  return data;
}

describe('alphaBounds', () => {
  it('finds the tight bounds of visible pixels', () => {
    const data = rgba(8, 8, [
      [2, 3, 255],
      [5, 3, 255],
      [2, 6, 255],
      [5, 6, 255],
    ]);

    expect(alphaBounds(data, 8, 8)).toEqual({ x: 2, y: 3, width: 4, height: 4 });
  });

  it('returns null for a fully transparent image', () => {
    expect(alphaBounds(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull();
  });

  it('crops pixel data to the bounds', () => {
    const data = rgba(4, 4, [
      [1, 1, 255],
      [2, 2, 255],
    ]);
    const bounds = alphaBounds(data, 4, 4);
    expect(bounds).not.toBeNull();

    const cropped = cropPixels(data, 4, bounds!);
    expect(cropped.length).toBe(2 * 2 * 4);
    expect(cropped[3]).toBe(255);
  });
});

describe('pixel hashing', () => {
  it('matches identical buffers and distinguishes different ones', () => {
    const a = rgba(4, 4, [[0, 0, 255]]);
    const b = rgba(4, 4, [[0, 0, 255]]);
    const c = rgba(4, 4, [[3, 3, 255]]);

    expect(hashPixels(a)).toBe(hashPixels(b));
    expect(pixelsEqual(a, b)).toBe(true);
    expect(pixelsEqual(a, c)).toBe(false);
  });
});
