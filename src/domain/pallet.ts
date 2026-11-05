import type { Order, Product } from './types.ts';

// Boxes on a pallet: how many, in how many layers, and which counts to offer while planning.

/** Boxes per layer when the product doesn't say (the large boxes: 2 × 2 on an EUR pallet). */
export const DEFAULT_PER_LAYER = 4;

/** Layers on a pallet: full ones, and the boxes in a part-filled top layer. */
export function palletLayers(boxes: number, perLayer = DEFAULT_PER_LAYER) {
  const per = Math.max(1, Math.round(perLayer));
  const n = Math.max(0, Math.round(boxes));
  const full = Math.floor(n / per);
  const top = n % per;
  return { full, top, layers: full + (top ? 1 : 0), perLayer: per };
}

/** Boxes per pallet for an order line: what was set while planning, else the product's. */
export const lineBoxesPerPallet = (line: { boxesPerPallet?: number }, product: Pick<Product, 'boxesPerPallet'> | undefined) => line.boxesPerPallet ?? product?.boxesPerPallet;

/**
 * Counts to offer for a product while planning: its standard, then those used on its earlier
 * orders (most used first, the given customer's first), at most six.
 */
export function boxCountOptions(product: Product, orders: Order[], customerId?: string): number[] {
  const tally = new Map<number, number>();
  for (const o of orders)
    for (const l of o.lines)
      if (l.productId === product.id && l.boxesPerPallet) tally.set(l.boxesPerPallet, (tally.get(l.boxesPerPallet) ?? 0) + (o.customerId === customerId ? 100 : 1));
  const used = [...tally].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([n]) => n);
  return [...new Set([...(product.boxesPerPallet ? [product.boxesPerPallet] : []), ...used])].slice(0, 6);
}
