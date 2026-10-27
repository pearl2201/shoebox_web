import { describe, expect, it } from 'vitest';
import {
  assignCharacters,
  buildBmFontText,
  buildBmFontXml,
  computeFontMetrics,
  detectBaseline,
  mappingCharacters,
  mergeVerticalParts,
  orderGlyphs,
  type BmFontData,
} from './font';
import type { BlobRegion } from './flood';

function blob(x: number, y: number, width: number, height: number, startIndex = 0): BlobRegion {
  return { x, y, width, height, pixels: width * height, startIndex };
}

describe('orderGlyphs', () => {
  it('sorts glyphs into rows then columns', () => {
    const glyphs = [
      blob(100, 60, 10, 20), // row 1, second
      blob(10, 5, 10, 20), // row 0, first
      blob(60, 58, 10, 20), // row 1, first
      blob(50, 3, 10, 20), // row 0, second
    ];

    const ordered = orderGlyphs(glyphs).map((glyph) => `${glyph.x},${glyph.y}`);
    expect(ordered).toEqual(['10,5', '50,3', '60,58', '100,60']);
  });
});

describe('detectBaseline', () => {
  it('finds the dominant glyph bottom', () => {
    const glyphs = [
      blob(0, 0, 10, 20), // bottom 20
      blob(12, 2, 8, 18), // bottom 20
      blob(22, 4, 6, 26), // descender, bottom 30
      blob(30, 1, 9, 19), // bottom 20
    ];

    expect(detectBaseline(glyphs, 2)).toBe(20);
  });

  it('returns null for no glyphs', () => {
    expect(detectBaseline([])).toBeNull();
  });
});

describe('mergeVerticalParts', () => {
  it('joins the dot of an “i” with its stem', () => {
    const stem = blob(10, 20, 4, 16);
    const dot = blob(11, 14, 3, 3);

    const merged = mergeVerticalParts([stem, dot], 6);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ x: 10, y: 14, width: 4, height: 22 });
  });

  it('keeps side-by-side glyphs separate', () => {
    const merged = mergeVerticalParts([blob(0, 10, 8, 20), blob(12, 10, 8, 20)], 6);
    expect(merged).toHaveLength(2);
  });

  it('keeps stacked rows separate when the gap is large', () => {
    const merged = mergeVerticalParts([blob(0, 0, 8, 20), blob(0, 40, 8, 20)], 6);
    expect(merged).toHaveLength(2);
  });
});

describe('computeFontMetrics', () => {
  it('measures ascender, descender and baseline per row', () => {
    const rowA = [blob(0, 4, 10, 16), blob(12, 0, 8, 20), blob(22, 8, 6, 24)];
    // bottoms 20, 20, 32 → baseline 20; top 0 → ascender 20, descender 12
    const rowB = [blob(0, 60, 10, 14), blob(12, 56, 8, 18)];

    const metrics = computeFontMetrics([rowA, rowB], 2);
    expect(metrics.base).toBe(20);
    expect(metrics.descender).toBe(12);
    expect(metrics.lineHeight).toBe(34);
    expect(metrics.baselines).toEqual([20, 74]);
  });

  it('falls back to the glyph bottom when baseline detection is off', () => {
    const row = [blob(0, 0, 10, 20), blob(12, 4, 8, 26)];

    const metrics = computeFontMetrics([row], 0, false);
    expect(metrics.baselines).toEqual([30]);
    expect(metrics.base).toBe(30);
    expect(metrics.descender).toBe(0);
  });
});

describe('character mapping', () => {
  it('drops whitespace, duplicates and non-BMP characters', () => {
    expect(mappingCharacters('abc a\nb😀c')).toEqual(['a', 'b', 'c']);
  });

  it('reports missing characters and extra glyphs', () => {
    const short = assignCharacters(5, ['a', 'b']);
    expect(short.assigned).toEqual(['a', 'b']);
    expect(short.extraGlyphs).toBe(3);
    expect(short.unusedChars).toBe(0);

    const long = assignCharacters(2, ['a', 'b', 'c']);
    expect(long.assigned).toEqual(['a', 'b']);
    expect(long.unusedChars).toBe(1);
  });
});

describe('BMFont writers', () => {
  const data: BmFontData = {
    face: 'Test Font',
    size: 24,
    lineHeight: 24,
    base: 20,
    scaleW: 128,
    scaleH: 64,
    image: 'font.png',
    glyphs: [
      { code: 32, x: 0, y: 0, width: 0, height: 0, xoffset: 0, yoffset: 0, xadvance: 6 },
      { code: 65, x: 1, y: 2, width: 12, height: 18, xoffset: 0, yoffset: 6, xadvance: 13 },
    ],
  };

  it('writes the expected text header and glyph count', () => {
    const text = buildBmFontText(data);
    expect(text).toContain('info face="Test Font" size=24');
    expect(text).toContain('common lineHeight=24 base=20 scaleW=128 scaleH=64');
    expect(text).toContain('chars count=2');
    expect(text).toContain('char id=65 x=1 y=2 width=12 height=18 xoffset=0 yoffset=6 xadvance=13');
  });

  it('writes XML with escaped attributes', () => {
    const xml = buildBmFontXml(data);
    expect(xml).toContain('<common lineHeight="24" base="20"');
    expect(xml).toContain('<char id="65"');
    expect(xml).toContain('file="font.png"');
  });
});
