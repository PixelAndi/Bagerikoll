import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

// A QR code drawn as one SVG path (made on the device – nothing is sent anywhere).

export function QrCode({ text, size = 240, title }: { text: string; size?: number; title?: string }) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c + 4},${r + 4}h1v1h-1z`;
    return { path: d, n: count + 8 };
  }, [text]);
  return (
    <svg className="qr-code" viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={title ?? text} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
