import { alphaBounds, cropPixels, fullRect, hashPixels, pixelsEqual, type Rect } from '../core/alpha';
import { pack, packPages, type PackItem, type PackPage } from '../core/packer';
import {
  buildMetadata,
  buildPhaserMultiAtlas,
  METADATA_FORMATS,
  metadataExtension,
  type AtlasPageInfo,
  type FrameEntry,
  type MetadataFormat,
} from '../core/templates';
import { canvasToBlob, createCanvas, decodeImage, releaseImage, type DecodedImage } from '../lib/image';
import { baseName, pageFileName, sanitizeFileName, uniqueName } from '../lib/names';
import { bool, num, str } from './settings';
import type { OutputFile, Settings, ToolDef } from './types';

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
      key: 'multiPage',
      label: 'Split into pages',
      type: 'boolean',
      help: 'When the sprites do not fit in one sheet, continue on atlas-2, atlas-3, …',
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
    multiPage: false,
    fileName: 'atlas.png',
    metadata: 'phaser',
  },

  async run(files, settings: Settings, ctx) {
    const padding = Math.max(0, Math.round(num(settings, 'padding', 2)));
    const trim = bool(settings, 'cropAlpha', true);
    const dedupe = bool(settings, 'dedupe', true);
    const powerOfTwo = bool(settings, 'powerOfTwo', true);
    const maxSize = Math.max(32, Math.round(num(settings, 'maxSize', 4096)));
    const multiPage = bool(settings, 'multiPage', false);
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
    ctx.progress(multiPage ? 'Packing pages…' : 'Packing…');

    const items: PackItem[] = unique.map((image, sourceIndex) => ({
      id: image.packId,
      sourceIndex,
      width: image.bounds.width,
      height: image.bounds.height,
    }));

    const packOptions = { padding, powerOfTwo, maxSize };
    const pages: PackPage[] = multiPage
      ? packPages(items, packOptions)
      : [{ ...pack(items, packOptions), index: 0 }];

    // Unique sprite index → the page and position it ended up on.
    const regions = new Map<number, { page: number; x: number; y: number }>();
    for (const page of pages) {
      for (const item of page.items) {
        regions.set(item.sourceIndex, { page: page.index, x: item.x, y: item.y });
      }
    }

    // ---- render --------------------------------------------------------------
    const imageFiles: OutputFile[] = [];
    const pageBlobs: Blob[] = [];

    for (const page of pages) {
      ctx.progress(
        pages.length > 1
          ? `Rendering page ${page.index + 1} / ${pages.length}…`
          : 'Rendering atlas…',
      );

      const { canvas, ctx: context } = createCanvas(page.width, page.height);
      context.imageSmoothingEnabled = false;

      for (const item of page.items) {
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

      const blob = await canvasToBlob(canvas, 'image/png');
      pageBlobs.push(blob);
      imageFiles.push({ name: pageFileName(fileName, page.index), blob });
    }

    // ---- metadata ------------------------------------------------------------
    const usedEntryIds = new Map<string, number>();
    const entryIds = images.map((image) => uniqueName(image.id, usedEntryIds));

    const framesPerPage: FrameEntry[][] = pages.map(() => []);

    images.forEach((image, index) => {
      const region = regions.get(uniqueIndexForInput[index]);
      if (!region) throw new Error(`Missing atlas region for “${image.file}”.`);
      framesPerPage[region.page].push({
        id: entryIds[index],
        x: region.x,
        y: region.y,
        width: image.bounds.width,
        height: image.bounds.height,
      });
    });

    for (const frames of framesPerPage) {
      frames.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }

    const metadataFiles: OutputFile[] = [];
    let metadataText: string | undefined;
    const metadataBase = fileName.replace(/\.[^.]+$/, '');

    if (metadataFormat !== 'none') {
      const extension = metadataExtension(metadataFormat);
      const pageInfos: AtlasPageInfo[] = pages.map((page, index) => ({
        frames: framesPerPage[index],
        atlas: {
          width: page.width,
          height: page.height,
          image: pageFileName(fileName, index),
        },
      }));

      if (pages.length > 1 && metadataFormat === 'phaser') {
        // One multi-atlas file describes every page.
        metadataText = buildPhaserMultiAtlas(pageInfos);
        metadataFiles.push({
          name: `${metadataBase}.${extension}`,
          blob: new Blob([metadataText], { type: 'text/plain' }),
        });
      } else {
        const texts = pageInfos.map((page) =>
          buildMetadata(metadataFormat, page.frames, page.atlas),
        );

        pageInfos.forEach((_, index) => {
          metadataFiles.push({
            name: `${pageFileName(metadataBase, index)}.${extension}`,
            blob: new Blob([texts[index]], { type: 'text/plain' }),
          });
        });

        metadataText = texts[0];
      }
    }

    const outputs = [...imageFiles, ...metadataFiles];

    for (const image of images) releaseImage(image.decoded);

    if (duplicates > 0) {
      notes.push(`${duplicates} duplicate sprite${duplicates === 1 ? '' : 's'} merged.`);
    }

    const regionCount = pages.reduce((total, page) => total + page.items.length, 0);
    if (regionCount < images.length) {
      notes.push(`${images.length} files packed into ${regionCount} unique regions.`);
    }
    if (pages.length > 1) {
      notes.push(
        `Sprites did not fit in one sheet — split into ${pages.length} pages: ${pages
          .map(
            (page) =>
              `${pageFileName(fileName, page.index)} (${page.width}×${page.height})`,
          )
          .join(', ')}.`,
      );
      if (metadataFormat !== 'none' && metadataFormat !== 'phaser') {
        notes.push('One metadata file was written per page.');
      }
      notes.push('The preview shows page 1.');
    }

    return {
      files: outputs,
      text: metadataText,
      textLabel: metadataText ? 'Metadata preview' : undefined,
      preview: {
        url: URL.createObjectURL(pageBlobs[0]),
        width: pages[0].width,
        height: pages[0].height,
      },
      summary: `${framesPerPage.reduce((total, frames) => total + frames.length, 0)} sprite${
        images.length === 1 ? '' : 's'
      } in ${regionCount} region${regionCount === 1 ? '' : 's'}${
        pages.length > 1 ? ` across ${pages.length} pages` : ''
      }`,
      notes,
    };
  },
};
