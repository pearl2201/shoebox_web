import { describe, expect, it } from 'vitest';
import { convexHull, polygonArea, simplifyPolygon, traceContour, type Point } from './hull';

function squareMask(size: number, rect: { x: number; y: number; w: number; h: number }) {
  const mask = new Uint8Array(size * size);
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) mask[y * size + x] = 1;
  }
  return mask;
}

describe('traceContour', () => {
  it('traces the boundary of a square region', () => {
    const size = 10;
    const mask = squareMask(size, { x: 2, y: 2, w: 5, h: 5 });
    const points = traceContour(mask, size, size, 2 * size + 2);

    expect(points.length).toBeGreaterThanOrEqual(4);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    expect(Math.min(...xs)).toBe(2);
    expect(Math.max(...xs)).toBe(6);
    expect(Math.min(...ys)).toBe(2);
    expect(Math.max(...ys)).toBe(6);
  });

  it('returns nothing for a background pixel', () => {
    const mask = new Uint8Array(16);
    expect(traceContour(mask, 4, 4, 0)).toEqual([]);
  });
});

describe('simplifyPolygon', () => {
  it('keeps the corners of a square outline', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
    ];

    const simplified = simplifyPolygon(points, 0.5);
    expect(simplified.length).toBe(4);
    expect(polygonArea(simplified)).toBeCloseTo(4);
  });
});

describe('convexHull', () => {
  it('wraps a diamond into four corners', () => {
    const hull = convexHull([
      { x: 2, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 2 },
      { x: 2, y: 2 },
    ]);

    expect(hull.length).toBe(4);
    expect(polygonArea(hull)).toBeCloseTo(8);
  });
});
