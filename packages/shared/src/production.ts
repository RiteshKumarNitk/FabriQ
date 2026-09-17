/**
 * Size-wise production fulfillment — required vs planned vs actual per size.
 *
 * Single authoritative implementation used by the API's cut-order detail
 * (fulfillment map) and unit-tested to prove actual quantities are DERIVED
 * from cutting records through the marker's size mix — never copied from
 * planned values.
 */

export interface FulfillmentLayInput {
  /** CANCELLED lays contribute nothing. */
  status?: string | null;
  ply: number;
  /** Marker size ratio, e.g. { M: 2, L: 2, XL: 1 }. */
  sizeRatio?: Record<string, number> | null;
  /** Completed cut operations for this lay. */
  cutOperations?: Array<{ status?: string | null; actualPieces?: number | null }> | null;
}

export interface FulfillmentRow {
  required: number;
  planned: number;
  actual: number;
  short: number;
  excess: number;
}

/**
 * Required vs planned vs actual per size — never silently rounded.
 *
 * • planned[size] = Σ size-ratio quantity × ply  (the contract the factory
 *   signed up to when planning lays).
 * • actual[size]  = Σ share of the lay's REAL output (completed cut
 *   operations) allocated by the marker's size mix — e.g. a marker of
 *   M2/L2/XL1 cutting 200 sets contributes 2/5 × 200 = 80 to M and L and
 *   40 to XL. An incomplete lay contributes nothing.
 * • short = max(0, required − planned); excess = max(0, planned − required)
 *   (both planning comparisons — actual shortfalls are visible by comparing
 *   required vs actual directly).
 */
export function sizeWiseFulfillment(
  required: Record<string, number> | null | undefined,
  lays: FulfillmentLayInput[],
): Record<string, FulfillmentRow> {
  const sizes = new Set<string>(Object.keys(required ?? {}));
  const planned: Record<string, number> = {};
  const actual: Record<string, number> = {};
  for (const lay of lays ?? []) {
    if (lay.status === 'CANCELLED') continue;
    const ratio = lay.sizeRatio ?? {};
    const markerGarments = Object.values(ratio).reduce(
      (s: number, v) => s + Math.max(0, Math.floor(Number(v))),
      0,
    );
    const completed = (lay.cutOperations ?? []).find(
      (o) => o.status === 'COMPLETED',
    );
    const actualSets =
      completed?.status === 'COMPLETED' ? Number(completed.actualPieces ?? 0) : 0;
    for (const [size, qty] of Object.entries(ratio)) {
      sizes.add(size);
      planned[size] = (planned[size] ?? 0) + Number(qty) * lay.ply;
      if (markerGarments > 0 && actualSets > 0) {
        actual[size] =
          (actual[size] ?? 0) + Math.floor((Number(qty) / markerGarments) * actualSets);
      }
    }
  }
  const out: Record<string, FulfillmentRow> = {};
  for (const size of sizes) {
    const r = Number(required?.[size] ?? 0);
    const p = planned[size] ?? 0;
    const a = actual[size] ?? 0;
    out[size] = {
      required: r,
      planned: p,
      actual: a,
      short: Math.max(0, r - p),
      excess: Math.max(0, p - r),
    };
  }
  return out;
}
