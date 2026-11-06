import type { ReactElement } from 'react';
import { DEFAULT_PER_LAYER, palletLayers } from '../domain/pallet.ts';

// A pallet as it stands on the floor: an EUR pallet with its boxes stacked layer by layer, seen
// from the front corner, drawn from a photo of the bakery's large boxes (4 a layer, 2 × 2). The
// same scale for every count, so a taller stack looks taller. A part-filled top layer shows the
// boxes it has. Only the front row's boxes show their white label (on the left, as on the real
// boxes); the ones behind face the other way. On the left, a height line with each layer
// numbered. `stacked` draws that many pallets on top of each other (two full pallets of 20 is
// how most are stored and shipped).

const BW = 40; // a box's width seen from the front (half the pallet's long side)
const BH = 14; // a box's height
const DX = 11; // depth: one box back moves this far right …
const DY = 7; // … and this far up
const PH = 10; // the pallet's height
const RULER = 24; // room on the left for the height line and its numbers

export function PalletIcon({ boxes, perLayer = DEFAULT_PER_LAYER, unit = 0.7, ruler = true, stacked = 1, title }: { boxes: number; perLayer?: number; unit?: number; ruler?: boolean; stacked?: number; title?: string }) {
  const { full, top, layers, perLayer: per } = palletLayers(boxes, perLayer);
  const cols = per >= 6 ? 3 : 2;
  const rows = Math.max(1, Math.ceil(per / cols)); // rows front to back
  const bw = (2 * BW) / cols;
  const depth = rows * DX;
  const lift = rows * DY;
  const stack = layers * BH; // one pallet's boxes
  const levels = Math.max(1, Math.round(stacked));
  const width = RULER + 2 * BW + depth + 2;
  const height = lift + levels * (stack + PH) + 2;
  const x0 = RULER;
  // Numbers on every layer when the picture is big enough to read them; else only the top one.
  const every = unit >= 0.5;

  const shapes: ReactElement[] = [];
  const marks: ReactElement[] = [];
  for (let k = 0; k < levels; k++) {
    const baseY = height - 1 - PH - k * (stack + PH); // top of this pallet's front edge
    shapes.push(<Pallet key={`p${k}`} x={x0} y={baseY} depth={depth} lift={lift} />);
    // Painter's order: back rows first, bottom layers first, left to right.
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
          shapes.push(<Box key={`${k}-${r}-${l}-${c}`} x={x} y={y} w={bw} label={r === 0} />);
        }
    if (ruler && layers > 0) {
      marks.push(<line key={`v${k}`} x1={17} y1={baseY} x2={17} y2={baseY - stack} />);
      for (let i = 0; i <= layers; i++) marks.push(<line key={`t${k}-${i}`} x1={i === 0 || i === layers ? 13 : 15} y1={baseY - i * BH} x2={21} y2={baseY - i * BH} />);
      for (let i = 1; i <= layers; i++)
        if (every || i === layers)
          marks.push(
            <text key={`n${k}-${i}`} x={12} y={baseY - (i - 0.5) * BH} className={every ? 'pallet-ruler-n' : 'pallet-ruler-n pallet-ruler-top'}>
              {i}
            </text>,
          );
    }
  }

  return (
    <svg className="pallet-icon" viewBox={`0 0 ${width} ${height}`} width={width * unit} height={height * unit} role="img" aria-label={title ?? `${boxes}`}>
      {title && <title>{title}</title>}
      {shapes}
      {ruler && <g className="pallet-ruler">{marks}</g>}
    </svg>
  );
}

function Box({ x, y, w, label }: { x: number; y: number; w: number; label: boolean }) {
  const lw = Math.min(w * 0.42, 15);
  return (
    <g className="pallet-box">
      <path className="pallet-box-top" d={`M${x},${y} l${DX},${-DY} h${w} l${-DX},${DY} z`} />
      <path className="pallet-box-side" d={`M${x + w},${y} l${DX},${-DY} v${BH} l${-DX},${DY} z`} />
      <rect className="pallet-box-front" x={x} y={y} width={w} height={BH} />
      {label && <rect className="pallet-box-label" x={x + 3} y={y + 3} width={lw} height={BH * 0.5} rx={0.6} />}
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
export function PalletBadge({ boxes, perLayer, label, unit, big = false, stacked }: { boxes: number; perLayer?: number; label: string; unit?: number; big?: boolean; stacked?: number }) {
  return (
    <span className={`pallet-badge ${big ? 'pallet-badge-big' : ''}`}>
      <PalletIcon boxes={boxes} perLayer={perLayer} unit={unit ?? (big ? 1.1 : 0.45)} title={label} stacked={stacked} />
      <span className="pallet-badge-text">{label}</span>
    </span>
  );
}
