export interface BlobRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number;
  startIndex: number;
}

/** 4-connected flood fill over a binary mask, returning bounding boxes. */
export function findBlobs(mask: Uint8Array, width: number, height: number): BlobRegion[] {
  const visited = new Uint8Array(mask.length);
  const blobs: BlobRegion[] = [];
  const stack: number[] = [];

  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      const start = startY * width + startX;
      if (mask[start] === 0 || visited[start] === 1) continue;

      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;
      let count = 0;

      stack.length = 0;
      stack.push(start);

      while (stack.length > 0) {
        const index = stack.pop() as number;
        if (visited[index] === 1 || mask[index] === 0) continue;

        visited[index] = 1;
        count += 1;

        const y = Math.floor(index / width);
        const x = index - y * width;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        if (x > 0) stack.push(index - 1);
        if (x < width - 1) stack.push(index + 1);
        if (y > 0) stack.push(index - width);
        if (y < height - 1) stack.push(index + width);
      }

      blobs.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixels: count,
        startIndex: start,
      });
    }
  }

  return blobs;
}

/**
 * Removes blobs fully contained in a larger blob. Mirrors the legacy
 * "merge sub clusters" option (e.g. the counter of a letter `O`).
 */
export function mergeContained(blobs: BlobRegion[]): BlobRegion[] {
  return blobs.filter((blob, index) => {
    return !blobs.some((other, otherIndex) => {
      if (index === otherIndex) return false;
      if (other.pixels <= blob.pixels) return false;
      return (
        blob.x >= other.x &&
        blob.y >= other.y &&
        blob.x + blob.width <= other.x + other.width &&
        blob.y + blob.height <= other.y + other.height
      );
    });
  });
}
