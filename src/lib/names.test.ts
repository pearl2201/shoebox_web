import { describe, expect, it } from 'vitest';
import { clipboardFileName } from './names';

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
