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

/** Pallets up to this many layers high are stacked two and two (the usual way for the 20-box pallets). */
export const STACK_MAX_LAYERS = 5;

/**
 * How a product's pallets go: in stacks of two when a pallet is low enough (two full pallets of
 * 20 on top of each other is how most are stored and shipped), else one by one.
 */
export function stackPlan(pallets: number, boxesPerPallet: number | undefined, perLayer = DEFAULT_PER_LAYER) {
  const n = Math.max(0, Math.round(pallets));
  const stackable = !!boxesPerPallet && palletLayers(boxesPerPallet, perLayer).layers <= STACK_MAX_LAYERS;
  return stackable ? { stackable, pairs: Math.floor(n / 2), singles: n % 2 } : { stackable, pairs: 0, singles: n };
}
