export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = CanvasRenderingContext2D;

export interface DecodedImage {
  width: number;
  height: number;
  bitmap: ImageBitmap;
  pixels: Uint8ClampedArray;
}

export function createCanvas(width: number, height: number): { canvas: AnyCanvas; ctx: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as unknown as Ctx2D;
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
    return { canvas, ctx };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
  return { canvas, ctx };
}

export async function canvasToBlob(canvas: AnyCanvas, type = 'image/png'): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type });
  }

  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode the canvas.'))),
      type,
    );
  });
}

/**
 * Decodes any image the browser supports into bitmap + raw RGBA pixels.
 * Alpha is kept un-premultiplied so trimming and alpha output stay accurate.
 */
export async function decodeImage(source: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(source, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });

  const { ctx } = createCanvas(bitmap.width, bitmap.height);
  ctx.clearRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  return {
    width: bitmap.width,
    height: bitmap.height,
    bitmap,
    pixels: imageData.data,
  };
}

export function releaseImage(image: DecodedImage): void {
  image.bitmap.close();
  image.pixels = new Uint8ClampedArray(0);
}
