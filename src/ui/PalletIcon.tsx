import type { ReactElement } from 'react';
import { DEFAULT_PER_LAYER, palletLayers } from '../domain/pallet.ts';

// A pallet as it stands on the floor: an EUR pallet with its boxes stacked layer by layer, seen
// from the front corner, drawn from a photo of the bakery's large boxes (4 a layer, 2 × 2). The
// same scale for every count, so a taller stack looks taller. A part-filled top layer shows the
// boxes it has. On the left, a height line with a tick per layer.

const BW = 40; // a box's width seen from the front (half the pallet's long side)
const BH = 14; // a box's height
const DX = 11; // depth: one box back moves this far right …
const DY = 7; // … and this far up
const PH = 10; // the pallet's height
const RULER = 14; // room on the left for the height line

export function PalletIcon({ boxes, perLayer = DEFAULT_PER_LAYER, unit = 0.7, ruler = true, title }: { boxes: number; perLayer?: number; unit?: number; ruler?: boolean; title?: string }) {
  const { full, top, layers, perLayer: per } = palletLayers(boxes, perLayer);
  const cols = per >= 6 ? 3 : 2;
  const rows = Math.max(1, Math.ceil(per / cols)); // rows front to back
  const bw = (2 * BW) / cols;
  const depth = rows * DX;
  const lift = rows * DY;
  const stack = layers * BH;
  const width = RULER + 2 * BW + depth + 2;
  const height = lift + stack + PH + 2;
  const baseY = height - 1 - PH; // top of the pallet's front edge
  const x0 = RULER;

  // Painter's order: back rows first, bottom layers first, left to right.
  const shapes: ReactElement[] = [];
  for (let r = rows - 1; r >= 0; r--)
    for (let l = 0; l < layers; l++)
      for (let c = 0; c < cols; c++) {
        // The part-filled top layer fills from the back row, left to right.
        if (l === full && top) {
          const index = (rows - 1 - r) * cols + c;
          if (index >= top) continue;
        }
        const x = x0 + c * bw + r * DX;
        const y = baseY - (l + 1) * BH - r * DY;
        shapes.push(<Box key={`${r}-${l}-${c}`} x={x} y={y} w={bw} />);
      }

  return (
    <svg className="pallet-icon" viewBox={`0 0 ${width} ${height}`} width={width * unit} height={height * unit} role="img" aria-label={title ?? `${boxes}`}>
      {title && <title>{title}</title>}
      <Pallet x={x0} y={baseY} depth={depth} lift={lift} />
      {shapes}
      {ruler && layers > 0 && (
        <g className="pallet-ruler">
          <line x1={5} y1={baseY} x2={5} y2={baseY - stack} />
          {Array.from({ length: layers + 1 }, (_, i) => (
            <line key={i} x1={i % 5 === 0 ? 1 : 3} y1={baseY - i * BH} x2={9} y2={baseY - i * BH} />
          ))}
        </g>
      )}
    </svg>
  );
}

function Box({ x, y, w }: { x: number; y: number; w: number }) {
  const label = Math.min(w * 0.42, 15);
  return (
    <g className="pallet-box">
      <path className="pallet-box-top" d={`M${x},${y} l${DX},${-DY} h${w} l${-DX},${DY} z`} />
      <path className="pallet-box-side" d={`M${x + w},${y} l${DX},${-DY} v${BH} l${-DX},${DY} z`} />
      <rect className="pallet-box-front" x={x} y={y} width={w} height={BH} />
      <rect className="pallet-box-label" x={x + w - label - 3} y={y + 3} width={label} height={BH * 0.5} rx={0.6} />
    </g>
  );
}

/** An EUR pallet: deck board, three blocks, bottom board – front, top and side. */
function Pallet({ x, y, depth, lift }: { x: number; y: number; depth: number; lift: number }) {
  const w = 2 * BW;
  const block = 9;
  return (
    <g className="pallet-wood">
      <path className="pallet-wood-top" d={`M${x},${y} l${depth},${-lift} h${w} l${-depth},${lift} z`} />
      <path className="pallet-wood-side" d={`M${x + w},${y} l${depth},${-lift} v${PH} l${-depth},${lift} z`} />
      <rect className="pallet-wood-front" x={x} y={y} width={w} height={2.5} />
      <rect className="pallet-wood-front" x={x} y={y + PH - 2.5} width={w} height={2.5} />
      {[0, (w - block) / 2, w - block].map((bx) => (
        <rect key={bx} className="pallet-wood-block" x={x + bx} y={y + 2.5} width={block} height={PH - 5} />
      ))}
    </g>
  );
}

/** A count with its pallet: the picture and "20 kart./pall · 5 lager" under it. */
export function PalletBadge({ boxes, perLayer, label, unit, big = false }: { boxes: number; perLayer?: number; label: string; unit?: number; big?: boolean }) {
  return (
    <span className={`pallet-badge ${big ? 'pallet-badge-big' : ''}`}>
      <PalletIcon boxes={boxes} perLayer={perLayer} unit={unit ?? (big ? 1.1 : 0.45)} title={label} />
      <span className="pallet-badge-text">{label}</span>
    </span>
  );
}
