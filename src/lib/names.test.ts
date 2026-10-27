import { describe, expect, it } from 'vitest';
import { clipboardFileName, pageFileName } from './names';

describe('clipboardFileName', () => {
  it('builds a timestamped png name', () => {
    expect(clipboardFileName('image/png')).toMatch(/^clipboard-\d{8}-\d{6}\.png$/);
  });

  it('maps mime types and appends a suffix for additional images', () => {
    expect(clipboardFileName('image/jpeg', 1)).toMatch(/^clipboard-\d{8}-\d{6}-2\.jpg$/);
    expect(clipboardFileName('image/webp')).toMatch(/\.webp$/);
    expect(clipboardFileName('image/gif')).toMatch(/\.gif$/);
  });
});

describe('pageFileName', () => {
  it('leaves the first page untouched', () => {
    expect(pageFileName('atlas.png', 0)).toBe('atlas.png');
  });

  it('numbers later pages before the extension', () => {
    expect(pageFileName('atlas.png', 1)).toBe('atlas-2.png');
    expect(pageFileName('my.sheet.jpg', 2)).toBe('my.sheet-3.jpg');
    expect(pageFileName('atlas', 3)).toBe('atlas-4');
  });
});
