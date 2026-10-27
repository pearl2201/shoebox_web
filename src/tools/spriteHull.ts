import { findBlobs } from '../core/flood';
import {
  convexHull,
  polygonArea,
  simplifyPolygon,
  traceContour,
  type Point,
} from '../core/hull';
import { canvasToBlob, createCanvas, decodeImage, releaseImage } from '../lib/image';
import { sanitizeFileName } from '../lib/names';
import { bool, num, str } from './settings';
import type { Settings, ToolDef } from './types';

interface HullImage {
  name: string;
  width: number;
  height: number;
  islands: Point[][];
}

const PREVIEW_SIZE = 720;

function formatHulls(images: HullImage[], format: string, mode: string): string {
  if (format === 'unity') {
    return images
      .flatMap((image) =>
        image.islands.map((points, index) => {
          const body = points
            .map((point) => `  new Vector2(${point.x}f, ${point.y}f)`)
            .join(',\n');
          return `// ${image.name} — island ${index + 1}\nnew Vector2[] {\n${body}\n};`;
        }),
      )
      .join('\n\n');
  }

  if (format === 'godot') {
    return images
      .flatMap((image) =>
        image.islands.map((points, index) => {
          const values = points.flatMap((point) => [point.x, point.y]).join(', ');
          return `# ${image.name} — island ${index + 1}\nPackedVector2Array(${values})`;
        }),
      )
      .join('\n\n');
  }

  return JSON.stringify({ app: 'ShoeBox Web', mode, images }, null, 2);
}

export const spriteHull: ToolDef = {
  id: 'sprite-hull',
  label: 'Sprite Hull',
  group: 'Physics',
  icon: 'hull',
  summary:
    'Trace the alpha silhouette of sprites into polygons for colliders, with JSON, Unity or Godot output.',
  accepts: 'images',
  fields: [
    {
      key: 'mode',
      label: 'Shape',
      type: 'select',
      options: [
        { value: 'outline', label: 'Outline (concave)' },
        { value: 'convex', label: 'Convex hull' },
      ],
    },
    {
      key: 'tolerance',
      label: 'Simplification',
      type: 'number',
      min: 0,
      max: 24,
      step: 0.5,
      help: 'Maximum deviation in pixels when simplifying the outline.',
    },
    {
      key: 'allIslands',
      label: 'Include all islands',
      type: 'boolean',
      help: 'Off = only the largest connected shape per image.',
    },
    {
      key: 'format',
      label: 'Output',
      type: 'select',
      options: [
        { value: 'json', label: 'JSON (points)' },
        { value: 'unity', label: 'Unity C# (Vector2[])' },
        { value: 'godot', label: 'Godot (PackedVector2Array)' },
      ],
    },
    { key: 'fileName', label: 'File name', type: 'text', placeholder: 'sprite.hull.json' },
  ],
  defaults: {
    mode: 'outline',
    tolerance: 2,
    allIslands: false,
    format: 'json',
    fileName: 'sprite.hull.json',
  },

  async run(files, settings: Settings, ctx) {
    if (files.length === 0) throw new Error('Drop one or more sprites.');

    const mode = str(settings, 'mode', 'outline');
    const tolerance = Math.max(0, num(settings, 'tolerance', 2));
    const allIslands = bool(settings, 'allIslands', false);
    const format = str(settings, 'format', 'json');
    const requestedName = sanitizeFileName(str(settings, 'fileName', 'sprite.hull.json'), 'sprite.hull.json');

    const notes: string[] = [];
    const images: HullImage[] = [];
    let previewUrl: string | null = null;
    let previewWidth = 0;
    let previewHeight = 0;

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      ctx.progress(`Tracing ${index + 1} / ${files.length} — ${file.name}`);

      try {
        const image = await decodeImage(file);
        const mask = new Uint8Array(image.width * image.height);
        for (let pixel = 0; pixel < mask.length; pixel++) {
          mask[pixel] = image.pixels[pixel * 4 + 3] > 8 ? 1 : 0;
        }

        const blobs = findBlobs(mask, image.width, image.height)
          .filter((blob) => blob.pixels >= 16)
          .sort((a, b) => b.pixels - a.pixels);

        const selected = allIslands ? blobs : blobs.slice(0, 1);
        const islands: Point[][] = [];

        for (const blob of selected) {
          const contour = traceContour(mask, image.width, image.height, blob.startIndex);
          if (contour.length < 4) continue;

          const points =
            mode === 'convex' ? convexHull(contour) : simplifyPolygon(contour, tolerance);
          if (points.length < 3 || polygonArea(points) < 2) continue;
          islands.push(points);
        }

        if (islands.length === 0) {
          notes.push(`No usable silhouette found in “${file.name}”.`);
        } else {
          images.push({ name: file.name, width: image.width, height: image.height, islands });
        }

        if (index === 0 && islands.length > 0) {
          const scale = Math.min(1, PREVIEW_SIZE / image.width, PREVIEW_SIZE / image.height);
          const { canvas: previewCanvas, ctx: preview } = createCanvas(
            Math.max(1, Math.round(image.width * scale)),
            Math.max(1, Math.round(image.height * scale)),
          );
          preview.drawImage(image.bitmap, 0, 0, previewCanvas.width, previewCanvas.height);
          preview.lineWidth = 1.5;
          preview.strokeStyle = '#7cf29b';
          preview.fillStyle = '#6cc7ff';

          for (const points of islands) {
            preview.beginPath();
            points.forEach((point, pointIndex) => {
              const x = point.x * scale;
              const y = point.y * scale;
              if (pointIndex === 0) preview.moveTo(x, y);
              else preview.lineTo(x, y);
            });
            preview.closePath();
            preview.stroke();

            if (points.length <= 120) {
              for (const point of points) {
                preview.fillRect(point.x * scale - 1, point.y * scale - 1, 2, 2);
              }
            }
          }

          const previewBlob = await canvasToBlob(previewCanvas);
          previewUrl = URL.createObjectURL(previewBlob);
          previewWidth = previewCanvas.width;
          previewHeight = previewCanvas.height;
        }

        releaseImage(image);
      } catch {
        notes.push(`Skipped “${file.name}” — not a readable image.`);
      }
    }

    if (images.length === 0) {
      throw new Error('No silhouettes were found. Check that the sprites have transparency.');
    }

    const text = formatHulls(images, format, mode);
    const extension = format === 'json' ? 'json' : 'txt';
    const fileName = requestedName.endsWith('.json') || requestedName.endsWith('.txt')
      ? requestedName.replace(/\.(json|txt)$/i, `.${extension}`)
      : `${requestedName}.${extension}`;

    const totalIslands = images.reduce((sum, image) => sum + image.islands.length, 0);
    const totalPoints = images.reduce(
      (sum, image) => sum + image.islands.reduce((count, points) => count + points.length, 0),
      0,
    );

    return {
      files: [
        { name: fileName, blob: new Blob([text], { type: 'text/plain' }) },
      ],
      text,
      textLabel: format === 'json' ? 'Hull JSON' : format === 'unity' ? 'Unity C#' : 'Godot polygon',
      preview: previewUrl
        ? {
            url: previewUrl,
            width: previewWidth,
            height: previewHeight,
          }
        : undefined,
      summary: `${images.length} sprite${images.length === 1 ? '' : 's'} · ${totalIslands} island${totalIslands === 1 ? '' : 's'} · ${totalPoints} points`,
      notes,
    };
  },
};
