import { alphaBounds, cropPixels, fullRect, hashPixels, pixelsEqual, type Rect } from '../core/alpha';
import { pack, type PackItem } from '../core/packer';
import {
  buildMetadata,
  METADATA_FORMATS,
  metadataExtension,
  type FrameEntry,
  type MetadataFormat,
} from '../core/templates';
import { canvasToBlob, createCanvas, decodeImage, releaseImage, type DecodedImage } from '../lib/image';
import { baseName, sanitizeFileName, uniqueName } from '../lib/names';
import { bool, num, str } from './settings';
import type { Settings, ToolDef } from './types';

interface LoadedImage {
  file: string;
  id: string;
  decoded: DecodedImage;
  bounds: Rect;
  pixels: Uint8ClampedArray;
  packId: string;
}

export const packSprites: ToolDef = {
  id: 'pack-sprites',
  label: 'Pack Sprites',
  group: 'Atlases',
  icon: 'pack',
  summary:
    'Pack images into one atlas with alpha trimming, spacing, duplicate merging and engine-ready metadata.',
  accepts: 'images',
  fields: [
    {
      key: 'padding',
      label: 'Padding',
      type: 'number',
      min: 0,
      max: 64,
      step: 1,
      help: 'Empty pixels between sprites.',
    },
    {
      key: 'cropAlpha',
      label: 'Trim transparent edges',
      type: 'boolean',
      help: 'Crop each sprite to its alpha bounds before packing.',
    },
    {
      key: 'dedupe',
      label: 'Merge identical sprites',
      type: 'boolean',
      help: 'Identical pixels share a single atlas region (great for animation frames).',
    },
    {
      key: 'powerOfTwo',
      label: 'Power-of-two sheet',
      type: 'boolean',
    },
    {
      key: 'maxSize',
      label: 'Max sheet size',
      type: 'number',
      min: 32,
      max: 8192,
      step: 32,
      help: 'Upper bound for width and height.',
    },
    {
      key: 'fileName',
      label: 'Atlas file name',
      type: 'text',
      placeholder: 'atlas.png',
    },
    {
      key: 'metadata',
      label: 'Metadata',
      type: 'select',
      options: METADATA_FORMATS,
    },
  ],
  defaults: {
    padding: 2,
    cropAlpha: true,
    dedupe: true,
    powerOfTwo: true,
    maxSize: 4096,
    fileName: 'atlas.png',
    metadata: 'phaser',
  },

  async run(files, settings: Settings, ctx) {
    const padding = Math.max(0, Math.round(num(settings, 'padding', 2)));
    const trim = bool(settings, 'cropAlpha', true);
    const dedupe = bool(settings, 'dedupe', true);
    const powerOfTwo = bool(settings, 'powerOfTwo', true);
    const maxSize = Math.max(32, Math.round(num(settings, 'maxSize', 4096)));
    const fileName = sanitizeFileName(str(settings, 'fileName', 'atlas.png'), 'atlas.png');
    const metadataFormat = str(settings, 'metadata', 'phaser') as MetadataFormat;

    const notes: string[] = [];
    const images: LoadedImage[] = [];

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      ctx.progress(`Decoding ${index + 1} / ${files.length} — ${file.name}`);

      try {
        const decoded = await decodeImage(file);
        const trimmed = trim
          ? alphaBounds(decoded.pixels, decoded.width, decoded.height)
          : null;
        const bounds: Rect = trimmed ?? fullRect(decoded.width, decoded.height);

        images.push({
          file: file.name,
          id: baseName(file.name),
          decoded,
          bounds,
          pixels: trim ? cropPixels(decoded.pixels, decoded.width, bounds) : decoded.pixels,
          packId: '',
        });
      } catch {
        notes.push(`Skipped “${file.name}” — not a readable image.`);
      }
    }

    if (images.length === 0) {
      throw new Error('No readable images were provided.');
    }

    // ---- duplicate detection -------------------------------------------------
    const unique: LoadedImage[] = [];
    const byHash = new Map<number, number[]>();
    const uniqueIndexForInput: number[] = [];
    let duplicates = 0;

    for (const image of images) {
      let match = -1;

      if (dedupe) {
        const hash = hashPixels(image.pixels);
        const candidates = byHash.get(hash) ?? [];
        for (const candidate of candidates) {
          const other = unique[candidate];
          if (other.pixels.length === image.pixels.length && pixelsEqual(other.pixels, image.pixels)) {
            match = candidate;
            break;
          }
        }
        if (match === -1) {
          candidates.push(unique.length);
          byHash.set(hash, candidates);
        }
      }

      if (match === -1) {
        match = unique.length;
        unique.push(image);
      } else {
        duplicates += 1;
      }

      uniqueIndexForInput.push(match);
    }

    const usedPackIds = new Map<string, number>();
    for (const image of unique) {
      image.packId = uniqueName(image.id, usedPackIds);
    }

    // ---- pack ----------------------------------------------------------------
    ctx.progress('Packing…');

    const items: PackItem[] = unique.map((image, sourceIndex) => ({
      id: image.packId,
      sourceIndex,
      width: image.bounds.width,
      height: image.bounds.height,
    }));

    const packed = pack(items, { padding, powerOfTwo, maxSize });

    // ---- render --------------------------------------------------------------
    ctx.progress('Rendering atlas…');
    const { canvas, ctx: context } = createCanvas(packed.width, packed.height);
    context.imageSmoothingEnabled = false;

    for (const item of packed.items) {
      const image = unique[item.sourceIndex];
      context.drawImage(
        image.decoded.bitmap,
        image.bounds.x,
        image.bounds.y,
        image.bounds.width,
        image.bounds.height,
        item.x,
        item.y,
        image.bounds.width,
        image.bounds.height,
      );
    }

    const atlasBlob = await canvasToBlob(canvas, 'image/png');

    // ---- metadata ------------------------------------------------------------
    const usedEntryIds = new Map<string, number>();
    const entryIds = images.map((image) => uniqueName(image.id, usedEntryIds));

    const frames: FrameEntry[] = images.map((image, index) => {
      const item = packed.items.find(
        (candidate) => candidate.sourceIndex === uniqueIndexForInput[index],
      );
      if (!item) throw new Error(`Missing atlas region for “${image.file}”.`);
      return {
        id: entryIds[index],
        x: item.x,
        y: item.y,
        width: image.bounds.width,
        height: image.bounds.height,
      };
    });

    frames.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    const metadataText =
      metadataFormat === 'none'
        ? undefined
        : buildMetadata(metadataFormat, frames, {
            width: packed.width,
            height: packed.height,
            image: fileName,
          });

    const outputs = [
      { name: fileName, blob: atlasBlob },
      ...(metadataText
        ? [
            {
              name: `${fileName.replace(/\.[^.]+$/, '')}.${metadataExtension(metadataFormat)}`,
              blob: new Blob([metadataText], { type: 'text/plain' }),
            },
          ]
        : []),
    ];

    for (const image of images) releaseImage(image.decoded);

    if (duplicates > 0) {
      notes.push(`${duplicates} duplicate sprite${duplicates === 1 ? '' : 's'} merged.`);
    }
    if (packed.items.length < images.length) {
      notes.push(`${images.length} files packed into ${packed.items.length} unique regions.`);
    }

    return {
      files: outputs,
      text: metadataText,
      textLabel: metadataText ? 'Metadata preview' : undefined,
      preview: {
        url: URL.createObjectURL(atlasBlob),
        width: packed.width,
        height: packed.height,
      },
      summary: `${frames.length} sprite${frames.length === 1 ? '' : 's'} in ${packed.items.length} region${packed.items.length === 1 ? '' : 's'}`,
      notes,
    };
  },
};
