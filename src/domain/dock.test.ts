import { describe, expect, it } from 'vitest';
import { deliveredFromChecks, deliveries, loadProgress, openLoadingDeviations, shortLoaded, withCheck } from './dock.ts';
import { boxCountOptions, lineBoxesPerPallet, palletLayers } from './pallet.ts';
import type { Deviation, Order, Product } from './types.ts';

// Made-up names and numbers only.
const order = (id: string, day: string, extra: Partial<Order> = {}): Order => ({ id, customerId: 'k1', day, lines: [{ productId: 'p', pallets: 2, boxes: 0 }], createdAt: 0, ...extra });

describe('pallet layers', () => {
  it('stacks 4 boxes a layer', () => {
    expect(palletLayers(20)).toEqual({ full: 5, top: 0, layers: 5, perLayer: 4 });
    expect(palletLayers(30)).toEqual({ full: 7, top: 2, layers: 8, perLayer: 4 });
    expect(palletLayers(40, 4).layers).toBe(10);
    expect(palletLayers(30, 6).layers).toBe(5);
  });
});

describe('boxes per pallet', () => {
  const product: Product = { id: 'p', name: 'Testbulle', boxesPerPallet: 20 };
  it("takes the order's count, else the product's", () => {
    expect(lineBoxesPerPallet({ boxesPerPallet: 30 }, product)).toBe(30);
    expect(lineBoxesPerPallet({}, product)).toBe(20);
  });
  it('offers the standard and the counts used before, the customer’s first', () => {
    const orders = [
      order('a', '2030-01-01', { customerId: 'k2', lines: [{ productId: 'p', pallets: 1, boxes: 0, boxesPerPallet: 24 }] }),
      order('b', '2030-01-02', { customerId: 'k2', lines: [{ productId: 'p', pallets: 1, boxes: 0, boxesPerPallet: 24 }] }),
      order('c', '2030-01-03', { customerId: 'k1', lines: [{ productId: 'p', pallets: 1, boxes: 0, boxesPerPallet: 30 }] }),
    ];
    expect(boxCountOptions(product, orders, 'k1')).toEqual([20, 30, 24]);
    expect(boxCountOptions(product, orders, 'k2')).toEqual([20, 24, 30]);
  });
});

describe('the loading dock', () => {
  const dev = (orderId: string, extra: Partial<Deviation> = {}): Deviation => ({ id: orderId + 'd', day: '2030-01-07', productId: '', kind: 'loading', note: 'x', at: 1, orderId, ...extra });
  it("lists the day's deliveries and earlier ones not loaded, problems and to-load first", () => {
    const orders = [
      order('done', '2030-01-07', { shippedAt: 5 }),
      order('todo', '2030-01-07'),
      order('late', '2030-01-06'),
      order('oldLoaded', '2030-01-06', { shippedAt: 3 }),
      order('tooOld', '2029-12-01'),
      order('cancel', '2030-01-07', { cancelled: true }),
      order('bad', '2030-01-07'),
    ];
    const list = deliveries(orders, [dev('bad')], '2030-01-07');
    expect(list.map((d) => [d.order.id, d.state, d.late])).toEqual([
      ['bad', 'deviation', false],
      ['late', 'toLoad', true],
      ['todo', 'toLoad', false],
      ['done', 'loaded', false],
    ]);
  });
  it('a handled deviation no longer holds a delivery up, nor shows to the managers', () => {
    const handled = dev('bad', { handled: { at: 9 } });
    expect(deliveries([order('bad', '2030-01-07')], [handled], '2030-01-07')[0].state).toBe('toLoad');
    expect(openLoadingDeviations([handled, dev('x')]).map((d) => d.orderId)).toEqual(['x']);
  });
});

describe('loading a delivery product by product', () => {
  const o: Order = {
    id: 'o',
    customerId: 'k',
    day: '2030-01-07',
    createdAt: 0,
    lines: [
      { productId: 'a', pallets: 3, boxes: 0 },
      { productId: 'b', pallets: 2, boxes: 6, boxesPerPallet: 30 },
      { productId: 'c', pallets: 1, boxes: 0 },
      { productId: 'z', pallets: 0, boxes: 0 },
    ],
  };
  const check = (productId: string, state: 'ok' | 'notDelivered' | 'short', pallets = 0, boxes = 0) => ({ productId, state, pallets, boxes, at: 1, workerIds: ['w'] });
  it('counts the products checked and the problems', () => {
    let x = { ...o, lineChecks: withCheck(o, check('a', 'ok')) };
    expect(loadProgress(x)).toMatchObject({ total: 3, checked: 1, done: false });
    x = { ...x, lineChecks: withCheck(x, check('c', 'notDelivered')) };
    x = { ...x, lineChecks: withCheck(x, check('b', 'short', 2, 0)) };
    expect(loadProgress(x).done).toBe(true);
    expect(loadProgress(x).problems.map((p) => p.productId)).toEqual(['c', 'b']);
    expect(deliveredFromChecks(x)).toEqual([
      { productId: 'a', pallets: 3, boxes: 0 },
      { productId: 'b', pallets: 2, boxes: 0 },
      { productId: 'c', pallets: 0, boxes: 0 },
    ]);
  });
  it('takes missing boxes off the extra boxes first, then off the pallets', () => {
    const line = { pallets: 2, boxes: 6, boxesPerPallet: 30 };
    expect(shortLoaded(line, undefined, 4)).toEqual({ pallets: 2, boxes: 2 });
    expect(shortLoaded(line, undefined, 10)).toEqual({ pallets: 1, boxes: 26 });
    expect(shortLoaded({ pallets: 3, boxes: 0 }, { boxesPerPallet: 20 }, 5)).toEqual({ pallets: 2, boxes: 15 });
    expect(shortLoaded({ pallets: 1, boxes: 0 }, { boxesPerPallet: 20 }, 25)).toEqual({ pallets: 0, boxes: 0 });
  });
});
