export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

export function sanitizeFileName(name: string, fallback: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned : fallback;
}

/** Returns a unique variant of `base`, appending `_2`, `_3`, ... on collisions. */
export function uniqueName(base: string, used: Map<string, number>): string {
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}_${count + 1}`;
}

/**
 * Page file name for multi-page outputs: `atlas.png` → `atlas.png`, `atlas-2.png`, `atlas-3.png`, …
 * The extension is preserved so the metadata file can point at the right image.
 */
export function pageFileName(fileName: string, pageIndex: number): string {
  if (pageIndex === 0) return fileName;
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return `${fileName}-${pageIndex + 1}`;
  return `${fileName.slice(0, dot)}-${pageIndex + 1}${fileName.slice(dot)}`;
}

/** Timestamped file name for images pasted from the clipboard. */
export function clipboardFileName(mimeType: string, index = 0): string {
  const extension =
    mimeType === 'image/jpeg'
      ? 'jpg'
      : mimeType === 'image/webp'
        ? 'webp'
        : mimeType === 'image/gif'
          ? 'gif'
          : 'png';

  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  return `clipboard-${stamp}${index > 0 ? `-${index + 1}` : ''}.${extension}`;
}

