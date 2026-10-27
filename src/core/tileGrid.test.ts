import { describe, expect, it } from 'vitest';
import { buildTileGrid, detectGrid } from './tileGrid';

/** Builds a grid of 4×4 tiles with a repeating 4-colour pattern. */
function makeGrid(
  offset: number,
  cells = 2,
): {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const tile = 4;
  const width = offset + tile * cells;
  const height = offset + tile * cells;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const colours = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];

  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const [r, g, b] = colours[(row % 2) * 2 + (column % 2)];
      for (let y = 0; y < tile; y++) {
        for (let x = 0; x < tile; x++) {
          const px = offset + column * tile + x;
          const py = offset + row * tile + y;
          const index = (py * width + px) * 4;
          pixels[index] = r;
          pixels[index + 1] = g;
          pixels[index + 2] = b;
          pixels[index + 3] = 255;
        }
      }
    }
  }

  return { pixels, width, height };
}

describe('detectGrid', () => {
  it('finds a 2×2 grid at offset 0', () => {
    const { pixels, width, height } = makeGrid(0);
    const candidate = detectGrid(pixels, width, height, 4, 4);

    expect(candidate.offsetX).toBe(0);
    expect(candidate.offsetY).toBe(0);
    expect(candidate.columns).toBe(2);
    expect(candidate.rows).toBe(2);
    expect(candidate.uniqueCount).toBe(4);
  });

  it('recovers a non-zero grid offset', () => {
    const { pixels, width, height } = makeGrid(2, 3);
    const candidate = detectGrid(pixels, width, height, 4, 4);

    expect(candidate.offsetX).toBe(2);
    expect(candidate.offsetY).toBe(2);
    expect(candidate.uniqueCount).toBe(4);
  });
});

describe('buildTileGrid', () => {
  it('deduplicates identical tiles into a map of indices', () => {
    const { pixels, width, height } = makeGrid(0);
    const grid = buildTileGrid(pixels, width, height, 4, 4, 0, 0);

    expect(grid.columns).toBe(2);
    expect(grid.rows).toBe(2);
    expect(grid.unique).toHaveLength(4);
    expect(grid.map).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('marks repeated tiles with the same index', () => {
    const tile = 2;
    const width = 4;
    const height = 2;
    const pixels = new Uint8ClampedArray(width * height * 4);
    // Fill the whole 2×2 image with one colour → two identical tiles.
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 10;
      pixels[index + 1] = 20;
      pixels[index + 2] = 30;
      pixels[index + 3] = 255;
    }

    const grid = buildTileGrid(pixels, width, height, tile, tile, 0, 0);
    expect(grid.unique).toHaveLength(1);
    expect(grid.map).toEqual([[0, 0]]);
  });
});
