import { fullRect, type Rect } from '../core/alpha';
import { decodeGif, releaseGifFrames } from '../lib/gif';
import { canvasToBlob, createCanvas } from '../lib/image';
import { sanitizeFileName } from '../lib/names';
import { bool, num, str } from './settings';
import type { OutputFile, Settings, ToolDef } from './types';

interface SheetFrame {
  index: number;
  x: number;
  y: number;
  delay: number;
}

export const ani2Sheet: ToolDef = {
  id: 'ani2-sheet',
  label: 'Ani 2 Sheet',
  group: 'Animation',
  icon: 'animation',
  summary:
    'Turn an animated GIF into a spritesheet or a numbered frame sequence, with optional alpha trimming.',
  accepts: 'images',
  fields: [
    {
      key: 'maxFrames',
      label: 'Max frames',
      type: 'number',
      min: 1,
      max: 500,
      step: 1,
      help: 'Frames beyond this limit are ignored.',
    },
    {
      key: 'trim',
      label: 'Trim transparent border',
      type: 'boolean',
      help: 'Crop all frames to their shared alpha bounds.',
    },
    { key: 'margin', label: 'Margin', type: 'number', min: 0, max: 64, step: 1 },
    { key: 'singleRow', label: 'Single row', type: 'boolean' },
    { key: 'sheetName', label: 'Sheet file name', type: 'text', placeholder: 'animation.png' },
    { key: 'writeFrames', label: 'Also export frame PNGs', type: 'boolean' },
    { key: 'framePrefix', label: 'Frame prefix', type: 'text', placeholder: 'frame' },
  ],
  defaults: {
    maxFrames: 60,
    trim: true,
    margin: 0,
    singleRow: false,
    sheetName: 'animation.png',
    writeFrames: false,
    framePrefix: 'frame',
  },

  async run(files, settings: Settings, ctx) {
    const source = files.find((file) => file.name.toLowerCase().endsWith('.gif'));
    if (!source) throw new Error('Drop an animated GIF (.gif).');

    const notes: string[] = [];
    if (files.length > 1) {
      notes.push(`Only “${source.name}” was used — other files were ignored.`);
    }

    const maxFrames = Math.max(1, Math.round(num(settings, 'maxFrames', 60)));
    const trim = bool(settings, 'trim', true);
    const margin = Math.max(0, Math.round(num(settings, 'margin', 0)));
    const singleRow = bool(settings, 'singleRow', false);
    const sheetName = sanitizeFileName(str(settings, 'sheetName', 'animation.png'), 'animation.png');
    const writeFrames = bool(settings, 'writeFrames', false);
    const framePrefix = sanitizeFileName(str(settings, 'framePrefix', 'frame'), 'frame');

    ctx.progress('Decoding GIF…');
    const gif = await decodeGif(source, maxFrames);

    if (gif.frames.length === 0) throw new Error('The GIF contains no readable frames.');
    if (gif.totalFrames > gif.frames.length) {
      notes.push(
        `Decoded the first ${gif.frames.length} of ${gif.totalFrames} frames (Max frames = ${maxFrames}).`,
      );
    }

    const crop: Rect =
      trim && gif.groupBounds ? gif.groupBounds : fullRect(gif.width, gif.height);
    const frameWidth = crop.width;
    const frameHeight = crop.height;
    const count = gif.frames.length;

    const columns = singleRow ? count : Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);

    const sheetWidth = columns * frameWidth + Math.max(0, columns - 1) * margin;
    const sheetHeight = rows * frameHeight + Math.max(0, rows - 1) * margin;

    ctx.progress('Compositing spritesheet…');
    const { canvas, ctx: context } = createCanvas(sheetWidth, sheetHeight);
    context.imageSmoothingEnabled = false;

    const sheetFrames: SheetFrame[] = [];
    for (let index = 0; index < count; index++) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = column * (frameWidth + margin);
      const y = row * (frameHeight + margin);

      context.drawImage(
        gif.frames[index].bitmap,
        crop.x,
        crop.y,
        frameWidth,
        frameHeight,
        x,
        y,
        frameWidth,
        frameHeight,
      );

      sheetFrames.push({ index, x, y, delay: gif.frames[index].delay });
    }

    const sheetBlob = await canvasToBlob(canvas);

    const metadata = {
      app: 'ShoeBox Web',
      image: sheetName,
      frameWidth,
      frameHeight,
      margin,
      columns,
      rows,
      frameCount: count,
      frames: sheetFrames,
    };

    const outputs: OutputFile[] = [
      { name: sheetName, blob: sheetBlob },
      {
        name: `${sheetName.replace(/\.[^.]+$/, '')}.frames.json`,
        blob: new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }),
      },
    ];

    if (writeFrames) {
      for (let index = 0; index < count; index++) {
        ctx.progress(`Exporting frame ${index + 1} / ${count}…`);
        const { canvas: frameCanvas, ctx: frameContext } = createCanvas(frameWidth, frameHeight);
        frameContext.drawImage(
          gif.frames[index].bitmap,
          crop.x,
          crop.y,
          frameWidth,
          frameHeight,
          0,
          0,
          frameWidth,
          frameHeight,
        );
        outputs.push({
          name: `${framePrefix}${String(index + 1).padStart(3, '0')}.png`,
          blob: await canvasToBlob(frameCanvas),
        });
      }
    }

    releaseGifFrames(gif);

    return {
      files: outputs,
      preview: {
        url: URL.createObjectURL(sheetBlob),
        width: sheetWidth,
        height: sheetHeight,
      },
      summary: `${count} frames · ${columns} × ${rows} grid · ${frameWidth} × ${frameHeight} px each`,
      notes,
    };
  },
};
