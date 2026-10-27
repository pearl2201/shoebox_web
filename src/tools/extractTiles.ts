import { pack } from '../core/packer';
import { buildTileGrid, detectGrid } from '../core/tileGrid';
import { canvasToBlob, createCanvas, decodeImage, releaseImage } from '../lib/image';
import { sanitizeFileName } from '../lib/names';
import { num, str } from './settings';
import type { Settings, ToolDef } from './types';

const MAX_ANALYSIS_PIXELS = 4_000_000;
const PREVIEW_WIDTH = 960;
const PREVIEW_HEIGHT = 680;

export const extractTiles: ToolDef = {
  id: 'extract-tiles',
  label: 'Extract Tiles',
  group: 'Tiles',
  icon: 'tiles',
  summary:
    'Detect the tile grid in a mock-up, deduplicate the tiles and export a tileset plus a tile map.',
  accepts: 'images',
  fields: [
    {
      key: 'tileWidth',
      label: 'Tile width',
      type: 'number',
      min: 2,
      max: 256,
      step: 1,
    },
    {
      key: 'tileHeight',
      label: 'Tile height',
      type: 'number',
      min: 2,
      max: 256,
      step: 1,
    },
    {
      key: 'tilesetName',
      label: 'Tileset file name',
      type: 'text',
      placeholder: 'tiles.png',
    },
  ],
  defaults: {
    tileWidth: 16,
    tileHeight: 16,
    tilesetName: 'tiles.png',
  },

  async run(files, settings: Settings, ctx) {
    const source = files[0];
    if (!source) throw new Error('Drop one image to analyse.');

    const tileWidth = Math.max(2, Math.round(num(settings, 'tileWidth', 16)));
    const tileHeight = Math.max(2, Math.round(num(settings, 'tileHeight', 16)));
    const tilesetName = sanitizeFileName(str(settings, 'tilesetName', 'tiles.png'), 'tiles.png');

    ctx.progress('Decoding image…');
    const image = await decodeImage(source);
    const notes: string[] = [];

    if (files.length > 1) notes.push('Only the first image was analysed.');
    if (image.width * image.height > MAX_ANALYSIS_PIXELS) {
      throw new Error(
        'Image is too large for tile detection (limit ~4 megapixels). Crop the mock-up first.',
      );
    }

    ctx.progress('Scoring grid offsets…');
    const candidate = detectGrid(image.pixels, image.width, image.height, tileWidth, tileHeight);

    ctx.progress('Extracting unique tiles…');
    const grid = buildTileGrid(
      image.pixels,
      image.width,
      image.height,
      tileWidth,
      tileHeight,
      candidate.offsetX,
      candidate.offsetY,
    );

    ctx.progress('Packing tileset…');
    const packed = pack(
      grid.unique.map((_, index) => ({
        id: String(index),
        sourceIndex: index,
        width: tileWidth,
        height: tileHeight,
      })),
      { padding: 1, powerOfTwo: false, maxSize: 8192 },
    );

    const { canvas: tilesetCanvas, ctx: tilesetContext } = createCanvas(
      packed.width,
      packed.height,
    );
    tilesetContext.imageSmoothingEnabled = false;

    const tilesetIndex: { index: number; x: number; y: number }[] = [];
    for (const item of packed.items) {
      const region = grid.unique[item.sourceIndex];
      tilesetContext.drawImage(
        image.bitmap,
        region.x,
        region.y,
        tileWidth,
        tileHeight,
        item.x,
        item.y,
        tileWidth,
        tileHeight,
      );
      tilesetIndex.push({ index: item.sourceIndex, x: item.x, y: item.y });
    }

    const tilesetBlob = await canvasToBlob(tilesetCanvas);

    const map = {
      app: 'ShoeBox Web',
      image: tilesetName,
      tileWidth,
      tileHeight,
      offset: { x: grid.offsetX, y: grid.offsetY },
      columns: grid.columns,
      rows: grid.rows,
      uniqueCount: grid.unique.length,
      tiles: tilesetIndex.sort((a, b) => a.index - b.index),
      map: grid.map,
    };

    const outputs = [
      { name: tilesetName, blob: tilesetBlob },
      {
        name: `${tilesetName.replace(/\.[^.]+$/, '')}.map.json`,
        blob: new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' }),
      },
    ];

    // Preview: source with the detected grid and tile ids.
    const scale = Math.min(1, PREVIEW_WIDTH / image.width, PREVIEW_HEIGHT / image.height);
    const previewWidth = Math.max(1, Math.round(image.width * scale));
    const previewHeight = Math.max(1, Math.round(image.height * scale));
    const { canvas: previewCanvas, ctx: preview } = createCanvas(previewWidth, previewHeight);
    preview.drawImage(image.bitmap, 0, 0, previewWidth, previewHeight);

    preview.strokeStyle = 'rgba(124, 242, 155, 0.9)';
    preview.lineWidth = 1;
    for (let column = 0; column <= grid.columns; column++) {
      const x = (grid.offsetX + column * tileWidth) * scale + 0.5;
      preview.beginPath();
      preview.moveTo(x, grid.offsetY * scale);
      preview.lineTo(x, (grid.offsetY + grid.rows * tileHeight) * scale);
      preview.stroke();
    }
    for (let row = 0; row <= grid.rows; row++) {
      const y = (grid.offsetY + row * tileHeight) * scale + 0.5;
      preview.beginPath();
      preview.moveTo(grid.offsetX * scale, y);
      preview.lineTo((grid.offsetX + grid.columns * tileWidth) * scale, y);
      preview.stroke();
    }

    if (grid.columns * grid.rows <= 600) {
      preview.fillStyle = '#6cc7ff';
      preview.font = '10px ui-monospace, Menlo, monospace';
      preview.textBaseline = 'top';
      for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
          const id = grid.map[row][column];
          preview.fillText(
            String(id),
            (grid.offsetX + column * tileWidth + 2) * scale,
            (grid.offsetY + row * tileHeight + 2) * scale,
          );
        }
      }
    }

    const previewBlob = await canvasToBlob(previewCanvas);
    releaseImage(image);

    notes.push(`Grid aligned at ${grid.offsetX + 1}, ${grid.offsetY + 1} within a ${tileWidth} × ${tileHeight} tile.`);

    return {
      files: outputs,
      preview: {
        url: URL.createObjectURL(previewBlob),
        width: previewWidth,
        height: previewHeight,
      },
      summary: `${grid.columns} × ${grid.rows} tiles · ${grid.unique.length} unique`,
      notes,
    };
  },
};
