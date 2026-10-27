import {
  assignCharacters,
  buildBmFontJson,
  buildBmFontText,
  buildBmFontXml,
  computeFontMetrics,
  groupGlyphRows,
  mappingCharacters,
  mergeVerticalParts,
  type BmFontData,
  type BmFontGlyph,
} from '../core/font';
import { findBlobs, mergeContained, type BlobRegion } from '../core/flood';
import { pack } from '../core/packer';
import { canvasToBlob, createCanvas, decodeImage, releaseImage } from '../lib/image';
import { baseName, sanitizeFileName } from '../lib/names';
import { bool, num, str } from './settings';
import type { Settings, ToolDef } from './types';

const DEFAULT_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?-_+=/()[]{}<>@#$%^&*';
const DEFAULT_PREVIEW = 'The quick brown fox\njumps over 0123456789!';

const FORMATS = [
  { value: 'text', label: 'BMFont text (.fnt)' },
  { value: 'xml', label: 'BMFont XML (.xml)' },
  { value: 'json', label: 'BMFont JSON (.json)' },
];

function measureLine(
  line: string,
  glyphs: Map<number, BmFontGlyph>,
  fallbackAdvance: number,
): number {
  let width = 0;
  for (const char of Array.from(line)) {
    const glyph = glyphs.get(char.codePointAt(0) ?? 0);
    width += glyph ? glyph.xadvance : fallbackAdvance;
  }
  return width;
}

async function renderPreview(
  atlas: Parameters<typeof canvasToBlob>[0],
  glyphs: BmFontGlyph[],
  lineHeight: number,
  text: string,
  fallbackAdvance: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const map = new Map(glyphs.map((glyph) => [glyph.code, glyph]));
  const lines = text.split('\n');
  const scale = Math.max(1, Math.min(3, Math.floor(48 / lineHeight)));
  const widths = lines.map((line) => measureLine(line, map, fallbackAdvance));
  const pad = 6;

  const width = Math.ceil(Math.max(1, ...widths) * scale) + pad * 2;
  const height = Math.ceil(lines.length * lineHeight * scale) + pad * 2;
  const { canvas, ctx } = createCanvas(width, height);
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);

  const logicalPad = pad / scale;
  lines.forEach((line, lineIndex) => {
    let penX = logicalPad;
    const lineTop = logicalPad + lineIndex * lineHeight;

    for (const char of Array.from(line)) {
      const glyph = map.get(char.codePointAt(0) ?? 0);
      if (!glyph) {
        penX += fallbackAdvance;
        continue;
      }
      if (glyph.width > 0 && glyph.height > 0) {
        ctx.drawImage(
          atlas,
          glyph.x,
          glyph.y,
          glyph.width,
          glyph.height,
          penX + glyph.xoffset,
          lineTop + glyph.yoffset,
          glyph.width,
          glyph.height,
        );
      }
      penX += glyph.xadvance;
    }
  });

  return { blob: await canvasToBlob(canvas), width, height };
}

export const bitmapFont: ToolDef = {
  id: 'bitmap-font',
  label: 'Bitmap Font',
  group: 'Fonts',
  icon: 'font',
  summary:
    'Slice a font sheet into glyphs, detect the baseline and export a BMFont atlas with text, XML or JSON metadata.',
  accepts: 'images',
  fields: [
    {
      key: 'chars',
      label: 'Characters',
      type: 'textarea',
      help: 'Glyphs are assigned in reading order (rows, then left-to-right). Whitespace is ignored; space is generated automatically.',
    },
    {
      key: 'autoBaseline',
      label: 'Detect baseline',
      type: 'boolean',
      help: 'Align glyphs to the most common bottom line (descenders are kept).',
    },
    { key: 'lineGap', label: 'Line gap', type: 'number', min: 0, max: 64, step: 1 },
    {
      key: 'letterSpacing',
      label: 'Letter spacing',
      type: 'number',
      min: -16,
      max: 64,
      step: 1,
    },
    {
      key: 'monospaceAdvance',
      label: 'Fixed advance',
      type: 'number',
      min: 0,
      max: 256,
      step: 1,
      help: '0 = proportional (glyph width + spacing). >0 forces one advance for every glyph.',
    },
    {
      key: 'spaceWidth',
      label: 'Space width',
      type: 'number',
      min: 0,
      max: 128,
      step: 1,
    },
    { key: 'minSize', label: 'Min glyph size', type: 'number', min: 1, max: 64, step: 1 },
    {
      key: 'mergeContained',
      label: 'Merge contained blobs',
      type: 'boolean',
      help: 'Keeps counters (the hole in “O”) part of the glyph.',
    },
    {
      key: 'mergeGap',
      label: 'Vertical merge gap',
      type: 'number',
      min: 0,
      max: 64,
      step: 1,
      help: 'Joins stacked parts such as the dot of “i” or accents. 0 disables.',
    },
    { key: 'padding', label: 'Atlas padding', type: 'number', min: 0, max: 32, step: 1 },
    { key: 'powerOfTwo', label: 'Power-of-two atlas', type: 'boolean' },
    { key: 'face', label: 'Font name', type: 'text', placeholder: 'auto from file name' },
    { key: 'atlasName', label: 'Atlas file name', type: 'text', placeholder: 'font.png' },
    { key: 'format', label: 'Metadata', type: 'select', options: FORMATS },
    { key: 'previewText', label: 'Preview text', type: 'textarea' },
  ],
  defaults: {
    chars: DEFAULT_CHARS,
    autoBaseline: true,
    lineGap: 0,
    letterSpacing: 1,
    monospaceAdvance: 0,
    spaceWidth: 6,
    minSize: 2,
    mergeContained: true,
    mergeGap: 6,
    padding: 1,
    powerOfTwo: true,
    face: '',
    atlasName: 'font.png',
    format: 'text',
    previewText: DEFAULT_PREVIEW,
  },

  async run(files, settings: Settings, ctx) {
    const source = files[0];
    if (!source) throw new Error('Drop one font sheet image.');

    const notes: string[] = [];
    if (files.length > 1) notes.push('Only the first image was used.');

    const minSize = Math.max(1, Math.round(num(settings, 'minSize', 2)));
    const merge = bool(settings, 'mergeContained', true);
    const mergeGap = Math.max(0, Math.round(num(settings, 'mergeGap', 6)));
    const lineGap = Math.max(0, Math.round(num(settings, 'lineGap', 0)));
    const spacing = Math.round(num(settings, 'letterSpacing', 1));
    const fixedAdvance = Math.max(0, Math.round(num(settings, 'monospaceAdvance', 0)));
    const spaceWidth = Math.max(0, Math.round(num(settings, 'spaceWidth', 6)));
    const padding = Math.max(0, Math.round(num(settings, 'padding', 1)));
    const powerOfTwo = bool(settings, 'powerOfTwo', true);
    const autoBaseline = bool(settings, 'autoBaseline', true);
    const atlasName = sanitizeFileName(str(settings, 'atlasName', 'font.png'), 'font.png');

    ctx.progress('Decoding font sheet…');
    const image = await decodeImage(source);
    const mask = new Uint8Array(image.width * image.height);
    for (let pixel = 0; pixel < mask.length; pixel++) {
      mask[pixel] = image.pixels[pixel * 4 + 3] > 8 ? 1 : 0;
    }

    ctx.progress('Finding glyphs…');
    let blobs = findBlobs(mask, image.width, image.height).filter(
      (blob) => blob.width >= minSize && blob.height >= minSize,
    );
    blobs = mergeVerticalParts(blobs, mergeGap);
    if (merge) blobs = mergeContained(blobs);

    const rows = groupGlyphRows(blobs);
    const ordered = rows.flatMap((row) => [...row].sort((a, b) => a.x - b.x));
    if (ordered.length === 0) {
      throw new Error('No glyphs found — check that the sheet has transparent gaps between glyphs.');
    }

    const charList = mappingCharacters(str(settings, 'chars', DEFAULT_CHARS));
    if (charList.length === 0) {
      throw new Error('Enter the characters that map to the glyphs, in reading order.');
    }

    const assignment = assignCharacters(ordered.length, charList);
    if (assignment.extraGlyphs > 0) {
      notes.push(
        `${assignment.extraGlyphs} glyph(s) had no character and were skipped — extend the character list.`,
      );
    }
    if (assignment.unusedChars > 0) {
      notes.push(`${assignment.unusedChars} character(s) in the list had no glyph.`);
    }

    const glyphBlobs = ordered.slice(0, assignment.assigned.length);

    const metrics = computeFontMetrics(rows, lineGap, autoBaseline);
    if (autoBaseline && metrics.descender === 0 && metrics.baselines.length > 0) {
      notes.push(
        'No descenders detected — the baseline sits on the lowest glyph bottom of each row.',
      );
    }

    const rowBaseline = new Map<BlobRegion, number>();
    rows.forEach((row, index) => {
      for (const blob of row) rowBaseline.set(blob, metrics.baselines[index]);
    });

    ctx.progress('Packing glyph atlas…');
    const packed = pack(
      glyphBlobs.map((blob, index) => ({
        id: String(index),
        sourceIndex: index,
        width: blob.width,
        height: blob.height,
      })),
      { padding, powerOfTwo, maxSize: 4096 },
    );

    const { canvas: atlasCanvas, ctx: atlasContext } = createCanvas(packed.width, packed.height);
    atlasContext.imageSmoothingEnabled = false;

    for (const item of packed.items) {
      const blob = glyphBlobs[item.sourceIndex];
      atlasContext.drawImage(
        image.bitmap,
        blob.x,
        blob.y,
        blob.width,
        blob.height,
        item.x,
        item.y,
        blob.width,
        blob.height,
      );
    }

    const atlasBlob = await canvasToBlob(atlasCanvas);

    const glyphs: BmFontGlyph[] = [
      {
        code: 32,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        xoffset: 0,
        yoffset: 0,
        xadvance: spaceWidth,
      },
    ];

    for (const item of packed.items) {
      const char = assignment.assigned[item.sourceIndex];
      const code = char.codePointAt(0);
      if (code === undefined) continue;

      const blob = glyphBlobs[item.sourceIndex];
      const baseline = rowBaseline.get(blob) ?? metrics.base;

      glyphs.push({
        code,
        x: item.x,
        y: item.y,
        width: blob.width,
        height: blob.height,
        xoffset: 0,
        yoffset: Math.max(0, metrics.base - baseline + blob.y),
        xadvance: fixedAdvance > 0 ? fixedAdvance : blob.width + spacing,
      });
    }

    glyphs.sort((a, b) => a.code - b.code);

    const face = str(settings, 'face', '').trim() || baseName(atlasName);
    const format = str(settings, 'format', 'text');
    const data: BmFontData = {
      face,
      size: metrics.lineHeight,
      lineHeight: metrics.lineHeight,
      base: metrics.base,
      scaleW: packed.width,
      scaleH: packed.height,
      image: atlasName,
      glyphs,
    };

    const text =
      format === 'xml'
        ? buildBmFontXml(data)
        : format === 'json'
          ? buildBmFontJson(data)
          : buildBmFontText(data);
    const extension = format === 'xml' ? 'xml' : format === 'json' ? 'json' : 'fnt';
    const metadataName = `${atlasName.replace(/\.[^.]+$/, '')}.${extension}`;

    ctx.progress('Rendering text preview…');
    const previewText = str(settings, 'previewText', DEFAULT_PREVIEW) || DEFAULT_PREVIEW;
    const preview = await renderPreview(
      atlasCanvas,
      glyphs,
      metrics.lineHeight,
      previewText,
      spaceWidth,
    );

    releaseImage(image);

    return {
      files: [
        { name: atlasName, blob: atlasBlob },
        { name: metadataName, blob: new Blob([text], { type: 'text/plain' }) },
      ],
      text,
      textLabel:
        format === 'json' ? 'BMFont JSON' : format === 'xml' ? 'BMFont XML' : 'BMFont text',
      preview: {
        url: URL.createObjectURL(preview.blob),
        width: preview.width,
        height: preview.height,
      },
      summary: `${glyphs.length - 1} glyphs · line ${metrics.lineHeight}px · base ${metrics.base}px`,
      notes,
    };
  },
};
