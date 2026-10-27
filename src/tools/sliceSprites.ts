import { findBlobs, mergeContained, type BlobRegion } from '../core/flood';
import { canvasToBlob, createCanvas, decodeImage, releaseImage } from '../lib/image';
import { sanitizeFileName } from '../lib/names';
import { bool, num, str } from './settings';
import type { OutputFile, Settings, ToolDef } from './types';

interface SpriteEntry {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const sliceSprites: ToolDef = {
  id: 'slice-sprites',
  label: 'Slice Sprites',
  group: 'Slicing',
  icon: 'slice',
  summary:
    'Split one image into individual sprites by detecting transparent gaps — fonts, UI kits and packed sheets.',
  accepts: 'images',
  fields: [
    {
      key: 'minSize',
      label: 'Min size',
      type: 'number',
      min: 1,
      max: 512,
      step: 1,
      help: 'Clusters smaller than this (width and height) are discarded.',
    },
    {
      key: 'maxSprites',
      label: 'Max sprites',
      type: 'number',
      min: 1,
      max: 2000,
      step: 1,
    },
    {
      key: 'mergeContained',
      label: 'Merge contained blobs',
      type: 'boolean',
      help: 'Treat blobs nested inside a larger blob as part of it.',
    },
    {
      key: 'baseName',
      label: 'File prefix',
      type: 'text',
      placeholder: 'slice',
    },
    {
      key: 'startIndex',
      label: 'Start index',
      type: 'number',
      min: 0,
      max: 99999,
      step: 1,
    },
    {
      key: 'pad',
      label: 'Index digits',
      type: 'number',
      min: 1,
      max: 6,
      step: 1,
    },
    {
      key: 'writeManifest',
      label: 'Write JSON manifest',
      type: 'boolean',
    },
  ],
  defaults: {
    minSize: 2,
    maxSprites: 250,
    mergeContained: true,
    baseName: 'slice',
    startIndex: 1,
    pad: 2,
    writeManifest: true,
  },

  async run(files, settings: Settings, ctx) {
    const source = files[0];
    if (!source) throw new Error('Drop one image to slice.');

    const minSize = Math.max(1, Math.round(num(settings, 'minSize', 2)));
    const maxSprites = Math.max(1, Math.round(num(settings, 'maxSprites', 250)));
    const merge = bool(settings, 'mergeContained', true);
    const base = sanitizeFileName(str(settings, 'baseName', 'slice'), 'slice');
    const startIndex = Math.max(0, Math.round(num(settings, 'startIndex', 1)));
    const pad = Math.max(1, Math.min(6, Math.round(num(settings, 'pad', 2))));
    const writeManifest = bool(settings, 'writeManifest', true);

    ctx.progress('Decoding image…');
    const image = await decodeImage(source);
    const notes: string[] = [];

    if (files.length > 1) {
      notes.push('Only the first dropped image was sliced.');
    }

    ctx.progress('Scanning alpha channel…');
    const mask = new Uint8Array(image.width * image.height);
    for (let index = 0; index < mask.length; index++) {
      mask[index] = image.pixels[index * 4 + 3] > 8 ? 1 : 0;
    }

    ctx.progress('Detecting sprites…');
    let blobs: BlobRegion[] = findBlobs(mask, image.width, image.height).filter(
      (blob) => blob.width >= minSize && blob.height >= minSize,
    );

    if (merge && blobs.length <= 4000) {
      blobs = mergeContained(blobs);
    } else if (merge) {
      notes.push('Skipped contained-blob merging because too many sprites were found.');
    }

    blobs.sort((a, b) => a.y - b.y || a.x - b.x);
    const truncated = blobs.length > maxSprites;
    if (truncated) blobs = blobs.slice(0, maxSprites);

    if (blobs.length === 0) {
      throw new Error('No sprites were found. Lower the minimum size or check the alpha channel.');
    }

    const outputs: OutputFile[] = [];
    const manifest: SpriteEntry[] = [];

    for (let index = 0; index < blobs.length; index++) {
      const blob = blobs[index];
      ctx.progress(`Exporting ${index + 1} / ${blobs.length}…`);

      const { canvas, ctx: context } = createCanvas(blob.width, blob.height);
      context.drawImage(
        image.bitmap,
        blob.x,
        blob.y,
        blob.width,
        blob.height,
        0,
        0,
        blob.width,
        blob.height,
      );

      const name = `${base}${String(startIndex + index).padStart(pad, '0')}.png`;
      outputs.push({ name, blob: await canvasToBlob(canvas) });
      manifest.push({ name, x: blob.x, y: blob.y, width: blob.width, height: blob.height });
    }

    if (writeManifest) {
      outputs.push({
        name: `${base}.json`,
        blob: new Blob(
          [JSON.stringify({ image: source.name, sprites: manifest }, null, 2)],
          { type: 'application/json' },
        ),
      });
    }

    // Preview: source image with detected regions outlined.
    const scale = Math.min(1, 960 / image.width, 680 / image.height);
    const { canvas: previewCanvas, ctx: preview } = createCanvas(
      Math.max(1, Math.round(image.width * scale)),
      Math.max(1, Math.round(image.height * scale)),
    );
    preview.drawImage(image.bitmap, 0, 0, previewCanvas.width, previewCanvas.height);
    preview.lineWidth = 1;
    preview.strokeStyle = '#7cf29b';
    for (const blob of blobs) {
      preview.strokeRect(
        blob.x * scale + 0.5,
        blob.y * scale + 0.5,
        Math.max(1, blob.width * scale - 1),
        Math.max(1, blob.height * scale - 1),
      );
    }
    const previewBlob = await canvasToBlob(previewCanvas);

    if (truncated) {
      notes.push(`Stopped at the ${maxSprites} sprite limit.`);
    }

    releaseImage(image);

    return {
      files: outputs,
      preview: {
        url: URL.createObjectURL(previewBlob),
        width: previewCanvas.width,
        height: previewCanvas.height,
      },
      summary: `${blobs.length} sprites from ${source.name}`,
      notes,
    };
  },
};
