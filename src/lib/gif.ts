import { decompressFrames, parseGIF } from 'gifuct-js';
import { alphaBounds, unionRect, type Rect } from '../core/alpha';
import { createCanvas } from './image';

export interface GifFrame {
  bitmap: ImageBitmap;
  bounds: Rect | null;
  delay: number;
}

export interface DecodedGif {
  width: number;
  height: number;
  frames: GifFrame[];
  totalFrames: number;
  groupBounds: Rect | null;
}

interface DisposalState {
  left: number;
  top: number;
  width: number;
  height: number;
  disposal: number;
  saved: ImageData | null;
}

/**
 * Decodes an animated GIF into one bitmap per frame.
 *
 * Frames are composited on a canvas using the GIF disposal methods:
 *  0/1 → leave in place, 2 → clear the frame rect, 3 → restore the previous canvas.
 * `putImageData` is used so transparent pixels replace (not blend with) the canvas.
 */
export async function decodeGif(file: Blob, maxFrames: number): Promise<DecodedGif> {
  const buffer = await file.arrayBuffer();
  const parsed = parseGIF(buffer);
  const decoded = decompressFrames(parsed, true);

  const width = parsed.lsd.width;
  const height = parsed.lsd.height;
  if (!width || !height) throw new Error('This GIF has no image dimensions.');

  const { canvas, ctx } = createCanvas(width, height);
  ctx.clearRect(0, 0, width, height);

  const limit = Math.max(1, Math.min(maxFrames, decoded.length));
  const frames: GifFrame[] = [];
  let groupBounds: Rect | null = null;
  let previous: DisposalState | null = null;

  for (let index = 0; index < limit; index++) {
    const frame = decoded[index];

    if (previous) {
      if (previous.disposal === 2) {
        ctx.clearRect(previous.left, previous.top, previous.width, previous.height);
      } else if (previous.disposal === 3 && previous.saved) {
        ctx.putImageData(previous.saved, 0, 0);
      }
    }

    const saved =
      frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;

    if (frame.patch && frame.dims.width > 0 && frame.dims.height > 0) {
      const patch = new ImageData(
        new Uint8ClampedArray(frame.patch),
        frame.dims.width,
        frame.dims.height,
      );
      ctx.putImageData(patch, frame.dims.left, frame.dims.top);
    }

    const snapshot = ctx.getImageData(0, 0, width, height);
    const bounds = alphaBounds(snapshot.data, width, height);
    if (bounds) groupBounds = groupBounds ? unionRect(groupBounds, bounds) : bounds;

    frames.push({
      bitmap: await createImageBitmap(canvas),
      bounds,
      delay: frame.delay ?? 0,
    });

    previous = {
      left: frame.dims.left,
      top: frame.dims.top,
      width: frame.dims.width,
      height: frame.dims.height,
      disposal: frame.disposalType,
      saved,
    };
  }

  return {
    width,
    height,
    frames,
    totalFrames: decoded.length,
    groupBounds,
  };
}

export function releaseGifFrames(gif: DecodedGif): void {
  for (const frame of gif.frames) frame.bitmap.close();
  gif.frames = [];
}
