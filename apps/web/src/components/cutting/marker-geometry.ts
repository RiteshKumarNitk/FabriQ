import type { CanvasPiece, CanvasDefect } from './marker-canvas';

const EPS = 1e-6;

export function rotatedBounds(p: CanvasPiece) {
  const rot = ((p.rotationDeg % 360) + 360) % 360;
  const rad = (rot * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bw = p.widthCm * cos + p.heightCm * sin;
  const bh = p.widthCm * sin + p.heightCm * cos;
  return {
    cx: p.xCm + p.widthCm / 2,
    cy: p.yCm + p.heightCm / 2,
    x0: p.xCm + p.widthCm / 2 - bw / 2,
    x1: p.xCm + p.widthCm / 2 + bw / 2,
    y0: p.yCm + p.heightCm / 2 - bh / 2,
    y1: p.yCm + p.heightCm / 2 + bh / 2,
  };
}

export type Violation = { width: boolean; overlap: boolean; defect: boolean };

/**
 * Violation pass over all pieces. Interval sweep: pieces sorted by x0; a
 * piece is only overlap-tested against the set of pieces whose x1 extends
 * past its own x0 — O(n log n) instead of the naive O(n²) over every pair.
 */
export function computeViolations(
  pieces: CanvasPiece[],
  widthCm: number,
  lengthCm: number,
  defects: CanvasDefect[],
): Map<string, Violation> {
  const list = pieces.map((p) => ({ piece: p, ...rotatedBounds(p) }));
  list.sort((a, b) => a.x0 - b.x0);

  const overlapped = new Set<string>();
  const active: typeof list = [];
  for (const r of list) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].x1 <= r.x0 + EPS) active.splice(i, 1);
    }
    for (const a of active) {
      if (r.y0 < a.y1 - EPS && a.y0 < r.y1 - EPS) {
        overlapped.add(r.piece.id);
        overlapped.add(a.piece.id);
      }
    }
    active.push(r);
  }

  const set = new Map<string, Violation>();
  for (const r of list) {
    const width = r.x0 < -EPS || r.y0 < -EPS || r.x1 > lengthCm + EPS || r.y1 > widthCm + EPS;
    const defect = defects.some(
      (d) =>
        r.x1 > d.startCm + EPS &&
        r.x0 < d.endCm - EPS &&
        r.y1 > Math.max(0, widthCm - d.affectedWidthCm) - EPS &&
        r.y0 < widthCm,
    );
    set.set(r.piece.id, { width, overlap: overlapped.has(r.piece.id), defect });
  }
  return set;
}
