import type { BlobRegion } from './flood';

export interface FontMetrics {
  /** Distance from the line top to the baseline. */
  base: number;
  lineHeight: number;
  ascender: number;
  descender: number;
}

/**
 * Merges vertically stacked parts of one glyph (i/j dots, accents, umlauts)
 * when their x-ranges overlap and the gap is at most `maxGap` pixels.
 * Side-by-side glyphs are never merged because their x-ranges do not overlap.
 */
export function mergeVerticalParts(blobs: BlobRegion[], maxGap = 6): BlobRegion[] {
  if (maxGap <= 0) return [...blobs];

  const current = [...blobs];
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < current.length && !changed; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const a = current[i];
        const b = current[j];

        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        if (overlapX < Math.min(a.width, b.width) * 0.5) continue;

        const upper = a.y <= b.y ? a : b;
        const lower = upper === a ? b : a;
        const gap = lower.y - (upper.y + upper.height);
        if (gap < 0 || gap > maxGap) continue;

        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const width = Math.max(a.x + a.width, b.x + b.width) - x;
        const height = Math.max(a.y + a.height, b.y + b.height) - y;

        current.splice(j, 1);
        current.splice(i, 1, {
          x,
          y,
          width,
          height,
          pixels: a.pixels + b.pixels,
          startIndex: Math.min(a.startIndex, b.startIndex),
        });

        changed = true;
        break;
      }
    }
  }

  return current;
}

/** Clusters glyphs into rows by vertical centre (tolerance from median height). */
export function groupGlyphRows(blobs: BlobRegion[]): BlobRegion[][] {
  if (blobs.length === 0) return [];

  const heights = blobs.map((blob) => blob.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? 1;
  const tolerance = Math.max(2, median * 0.6);

  const byCentre = [...blobs].sort(
    (a, b) => a.y + a.height / 2 - (b.y + b.height / 2),
  );

  const rows: BlobRegion[][] = [];
  for (const blob of byCentre) {
    const centre = blob.y + blob.height / 2;
    const row = rows.find((candidate) => {
      const reference = candidate[0];
      return Math.abs(reference.y + reference.height / 2 - centre) <= tolerance;
    });
    if (row) row.push(blob);
    else rows.push([blob]);
  }

  return rows;
}

/**
 * Sorts glyph blobs into reading order: rows top-to-bottom, glyphs left-to-right.
 */
export function orderGlyphs(blobs: BlobRegion[]): BlobRegion[] {
  return groupGlyphRows(blobs).flatMap((row) => [...row].sort((a, b) => a.x - b.x));
}

/**
 * Finds the most common glyph bottom (the baseline) within `tolerance` px.
 * Returns null when no dominant line exists.
 */
export function detectBaseline(blobs: BlobRegion[], tolerance = 2): number | null {
  if (blobs.length === 0) return null;

  const bottoms = blobs.map((blob) => blob.y + blob.height).sort((a, b) => a - b);
  let best: { value: number; count: number } | null = null;

  for (const value of bottoms) {
    let count = 0;
    for (const other of bottoms) {
      if (Math.abs(other - value) <= tolerance) count += 1;
    }
    if (!best || count > best.count || (count === best.count && value > best.value)) {
      best = { value, count };
    }
  }

  if (!best) return null;

  // Snap to the lowest bottom inside the winning cluster (curves/flats may differ by 1px).
  let snapped = best.value;
  for (const value of bottoms) {
    if (Math.abs(value - best.value) <= tolerance && value > snapped) snapped = value;
  }
  return snapped;
}

/**
 * Row-aware font metrics. Every row gets its own detected baseline and all
 * glyphs are normalised to one common line top, so multi-row font sheets keep
 * a correct baseline.
 */
export function computeFontMetrics(
  rows: BlobRegion[][],
  lineGap = 0,
  detect = true,
): FontMetrics & { baselines: number[] } {
  if (rows.length === 0) {
    return { base: 1, ascender: 1, descender: 0, lineHeight: 1, baselines: [] };
  }

  const baselines = rows.map((row) => {
    const bottom = Math.max(...row.map((blob) => blob.y + blob.height));
    return detect ? (detectBaseline(row) ?? bottom) : bottom;
  });

  let ascender = 1;
  let descender = 0;

  rows.forEach((row, index) => {
    const top = Math.min(...row.map((blob) => blob.y));
    const bottom = Math.max(...row.map((blob) => blob.y + blob.height));
    ascender = Math.max(ascender, baselines[index] - top);
    descender = Math.max(descender, bottom - baselines[index]);
  });

  return {
    base: ascender,
    ascender,
    descender,
    baselines,
    lineHeight: Math.max(1, ascender + descender + Math.max(0, lineGap)),
  };
}

/** Characters usable as BMFont ids (BMP only), whitespace removed, de-duplicated. */
export function mappingCharacters(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const char of Array.from(raw)) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0xffff) continue;
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') continue;
    if (seen.has(char)) continue;
    seen.add(char);
    out.push(char);
  }

  return out;
}

export function assignCharacters(glyphCount: number, chars: string[]) {
  const count = Math.min(glyphCount, chars.length);
  return {
    assigned: chars.slice(0, count),
    extraGlyphs: Math.max(0, glyphCount - count),
    unusedChars: Math.max(0, chars.length - count),
  };
}

export interface BmFontGlyph {
  code: number;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
}

export interface BmFontData {
  face: string;
  size: number;
  lineHeight: number;
  base: number;
  scaleW: number;
  scaleH: number;
  image: string;
  glyphs: BmFontGlyph[];
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeQuoted(value: string): string {
  return value.replace(/"/g, "'");
}

/** AngelCode BMFont text format. */
export function buildBmFontText(data: BmFontData): string {
  const lines: string[] = [
    `info face="${escapeQuoted(data.face)}" size=${data.size} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1`,
    `common lineHeight=${data.lineHeight} base=${data.base} scaleW=${data.scaleW} scaleH=${data.scaleH} pages=1 packed=0`,
    `page id=0 file="${escapeQuoted(data.image)}"`,
    `chars count=${data.glyphs.length}`,
  ];

  for (const glyph of data.glyphs) {
    lines.push(
      `char id=${glyph.code} x=${glyph.x} y=${glyph.y} width=${glyph.width} height=${glyph.height} xoffset=${glyph.xoffset} yoffset=${glyph.yoffset} xadvance=${glyph.xadvance} page=0 chnl=15`,
    );
  }

  return lines.join('\n');
}

/** AngelCode BMFont XML (what Phaser 3's BitmapText loader expects). */
export function buildBmFontXml(data: BmFontData): string {
  const glyphs = data.glyphs
    .map(
      (glyph) =>
        `    <char id="${glyph.code}" x="${glyph.x}" y="${glyph.y}" width="${glyph.width}" height="${glyph.height}" xoffset="${glyph.xoffset}" yoffset="${glyph.yoffset}" xadvance="${glyph.xadvance}" page="0" chnl="15" />`,
    )
    .join('\n');

  return `<?xml version="1.0"?>
<font>
  <info face="${escapeAttribute(data.face)}" size="${data.size}" bold="0" italic="0" charset="" unicode="1" stretchH="100" smooth="1" aa="1" padding="0,0,0,0" spacing="1,1" />
  <common lineHeight="${data.lineHeight}" base="${data.base}" scaleW="${data.scaleW}" scaleH="${data.scaleH}" pages="1" packed="0" />
  <pages>
    <page id="0" file="${escapeAttribute(data.image)}" />
  </pages>
  <chars count="${data.glyphs.length}">
${glyphs}
  </chars>
</font>`;
}

export function buildBmFontJson(data: BmFontData): string {
  return JSON.stringify(
    {
      info: {
        face: data.face,
        size: data.size,
        bold: 0,
        italic: 0,
        unicode: 1,
        smooth: 1,
        aa: 1,
        padding: [0, 0, 0, 0],
        spacing: [1, 1],
      },
      common: {
        lineHeight: data.lineHeight,
        base: data.base,
        scaleW: data.scaleW,
        scaleH: data.scaleH,
        pages: 1,
        packed: 0,
      },
      pages: [data.image],
      chars: data.glyphs.map((glyph) => ({
        id: glyph.code,
        x: glyph.x,
        y: glyph.y,
        width: glyph.width,
        height: glyph.height,
        xoffset: glyph.xoffset,
        yoffset: glyph.yoffset,
        xadvance: glyph.xadvance,
        page: 0,
        chnl: 15,
      })),
    },
    null,
    2,
  );
}
