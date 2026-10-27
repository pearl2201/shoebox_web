export interface Point {
  x: number;
  y: number;
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/**
 * Moore-neighbour boundary tracing of the connected region containing
 * `startIndex`. Returns the outer contour in image coordinates.
 */
export function traceContour(
  mask: Uint8Array,
  width: number,
  height: number,
  startIndex: number,
): Point[] {
  if (startIndex < 0 || startIndex >= mask.length || mask[startIndex] === 0) return [];

  const startX = startIndex % width;
  const startY = Math.floor(startIndex / width);

  let x = startX;
  let y = startY;
  let backX = startX - 1;
  let backY = startY;

  const points: Point[] = [{ x, y }];
  const maxSteps = Math.max(128, width * height * 2);
  let steps = 0;

  while (steps < maxSteps) {
    steps += 1;

    let direction = DIRECTIONS.findIndex(
      ([dx, dy]) => backX - x === dx && backY - y === dy,
    );
    if (direction === -1) direction = 4;

    let nextX = -1;
    let nextY = -1;
    let lastBackgroundX = backX;
    let lastBackgroundY = backY;

    for (let step = 1; step <= 8; step++) {
      const [dx, dy] = DIRECTIONS[(direction + step) % 8];
      const candidateX = x + dx;
      const candidateY = y + dy;

      if (candidateX < 0 || candidateY < 0 || candidateX >= width || candidateY >= height) {
        lastBackgroundX = candidateX;
        lastBackgroundY = candidateY;
        continue;
      }

      if (mask[candidateY * width + candidateX] === 1) {
        nextX = candidateX;
        nextY = candidateY;
        break;
      }

      lastBackgroundX = candidateX;
      lastBackgroundY = candidateY;
    }

    if (nextX === -1) break;

    backX = lastBackgroundX;
    backY = lastBackgroundY;
    x = nextX;
    y = nextY;
    points.push({ x, y });

    if (x === startX && y === startY && points.length > 3) break;
  }

  return points;
}

function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function perpendicularDistance(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  return Math.abs(dy * point.x - dx * point.y + to.x * from.y - to.y * from.x) / length;
}

function douglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  const first = points[0];
  const last = points[points.length - 1];
  let index = -1;
  let maxDistance = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance <= tolerance || index === -1) return [first, last];

  const left = douglasPeucker(points.slice(0, index + 1), tolerance);
  const right = douglasPeucker(points.slice(index), tolerance);
  return [...left, ...right.slice(1)];
}

function dedupeClosed(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) out.push(point);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first.x === last.x && first.y === last.y) out.pop();
  }
  return out;
}

/** Simplifies a closed polygon while keeping its shape within `tolerance` px. */
export function simplifyPolygon(points: Point[], tolerance: number): Point[] {
  const deduped = dedupeClosed(points);
  if (deduped.length < 4 || tolerance <= 0) return deduped;

  let farIndex = 1;
  let farDistance = -1;
  for (let i = 1; i < deduped.length; i++) {
    const distance = distanceSquared(deduped[0], deduped[i]);
    if (distance > farDistance) {
      farDistance = distance;
      farIndex = i;
    }
  }

  const firstHalf = deduped.slice(0, farIndex + 1);
  const secondHalf = [...deduped.slice(farIndex), deduped[0]];
  const a = douglasPeucker(firstHalf, tolerance);
  const b = douglasPeucker(secondHalf, tolerance);

  return dedupeClosed([...a.slice(0, -1), ...b.slice(0, -1)]);
}

/** Andrew's monotone chain convex hull. */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;

  const sorted = [...points]
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
    .filter((point, index, all) => index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y);

  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}
