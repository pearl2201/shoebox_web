export interface FrameEntry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtlasInfo {
  width: number;
  height: number;
  image: string;
}

export type MetadataFormat = 'phaser' | 'texturepacker' | 'godot' | 'css' | 'text' | 'none';

export const METADATA_FORMATS: { value: MetadataFormat; label: string }[] = [
  { value: 'phaser', label: 'Phaser 3 atlas (JSON hash)' },
  { value: 'texturepacker', label: 'Unity / TexturePacker (JSON array)' },
  { value: 'godot', label: 'Godot (JSON regions)' },
  { value: 'css', label: 'CSS sprite classes' },
  { value: 'text', label: 'Plain text (id x y w h)' },
  { value: 'none', label: 'No metadata file' },
];

export function metadataExtension(format: MetadataFormat): string {
  switch (format) {
    case 'phaser':
    case 'texturepacker':
    case 'godot':
      return 'json';
    case 'css':
      return 'css';
    case 'text':
      return 'txt';
    default:
      return '';
  }
}

export function cssClassName(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return /^[0-9]/.test(cleaned) ? `s_${cleaned}` : cleaned;
}

function phaserAtlas(frames: FrameEntry[], atlas: AtlasInfo) {
  const map: Record<string, unknown> = {};
  for (const frame of frames) {
    map[frame.id] = {
      frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
      sourceSize: { w: frame.width, h: frame.height },
    };
  }

  return JSON.stringify(
    {
      frames: map,
      meta: {
        app: 'ShoeBox Web',
        version: '1.0',
        image: atlas.image,
        format: 'RGBA8888',
        size: { w: atlas.width, h: atlas.height },
        scale: '1',
      },
    },
    null,
    2,
  );
}

function texturePackerAtlas(frames: FrameEntry[], atlas: AtlasInfo) {
  return JSON.stringify(
    {
      frames: frames.map((frame) => ({
        filename: frame.id,
        frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
        sourceSize: { w: frame.width, h: frame.height },
      })),
      meta: {
        app: 'ShoeBox Web',
        version: '1.0',
        image: atlas.image,
        format: 'RGBA8888',
        size: { w: atlas.width, h: atlas.height },
        scale: '1',
      },
    },
    null,
    2,
  );
}

function godotAtlas(frames: FrameEntry[], atlas: AtlasInfo) {
  return JSON.stringify(
    {
      image: atlas.image,
      size: { width: atlas.width, height: atlas.height },
      frames: frames.map((frame) => ({
        id: frame.id,
        region: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      })),
    },
    null,
    2,
  );
}

export function buildMetadata(
  format: MetadataFormat,
  frames: FrameEntry[],
  atlas: AtlasInfo,
): string {
  switch (format) {
    case 'phaser':
      return phaserAtlas(frames, atlas);
    case 'texturepacker':
      return texturePackerAtlas(frames, atlas);
    case 'godot':
      return godotAtlas(frames, atlas);
    case 'css':
      return frames
        .map(
          (frame) =>
            `.${cssClassName(frame.id)} {\n  width: ${frame.width}px;\n  height: ${frame.height}px;\n  background: url("${atlas.image}") no-repeat -${frame.x}px -${frame.y}px;\n}`,
        )
        .join('\n\n');
    case 'text':
      return frames
        .map((frame) => `${frame.id} ${frame.x} ${frame.y} ${frame.width} ${frame.height}`)
        .join('\n');
    default:
      return '';
  }
}
