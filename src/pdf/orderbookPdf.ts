import type { Orderbook } from '../domain/orderbook.ts';

// The order book as a landscape-A4 PDF with real, selectable text (drawn with jsPDF, not a
// picture), so it reads upright on a screen, prints sideways, and the text can be copied or
// searched. mode "book" shows the shipping figures (pallets, weight) for the floor; "accounting"
// shows the prices and the week's total, with no pallets or weight. jsPDF loads only when this runs.

export async function saveOrderbookPdf(ob: Orderbook, filename: string, mode: 'book' | 'accounting' = 'book'): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 8;
  const accounting = mode === 'accounting';
  const kg = (n: number) => `${n.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} kg`;
  const kr = (n?: number) => (n === undefined ? 'pris saknas' : `${Math.round(n).toLocaleString('sv-SE')} kr`);
  const fit = (text: string, maxW: number) => {
    if (doc.getTextWidth(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
    return t + '…';
  };
  // A fakturerings-marking (ST / BE) in a thin frame, ending at rightX; returns its left edge.
  const framedMark = (rightX: number, y: number, text: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    const tw = doc.getTextWidth(text);
    const padX = 0.9;
    const h = 2.7;
    const boxW = tw + padX * 2;
    const bx = rightX - boxW;
    doc.setDrawColor(0);
    doc.setLineWidth(0.25);
    doc.rect(bx, y - 2.1, boxW, h);
    doc.setTextColor(0);
    doc.text(text, bx + padX, y);
    return bx;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${accounting ? 'Ekonomi' : 'Orderbok'} — ${ob.weekLabel}`, M, 13);

  const top = 19;
  const footerY = PH - 9;
  const n = ob.days.length;
  const gutter = 3;
  const colW = (PW - 2 * M - (n - 1) * gutter) / n;

  doc.setDrawColor(190);
  doc.setLineWidth(0.2);
  for (let i = 1; i < n; i++) {
    const x = M + i * (colW + gutter) - gutter / 2;
    doc.line(x, top - 3, x, footerY - 2);
  }

  ob.days.forEach((d, i) => {
    const x0 = M + i * (colW + gutter);
    let y = top;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0);
    doc.text(fit(d.label, colW), x0, y);
    y += 3.6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(accounting ? kr(d.amount) : `${d.pallets} pall · ${kg(d.grossKg)}`, x0, y);
    y += 1.6;
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(x0, y, x0 + colW, y);
    y += 3.3;

    for (const o of d.orders) {
      if (y > footerY - 6) {
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text('…', x0, y);
        break;
      }
      // right side: order number then the framed marking
      let rightX = x0 + colW;
      if (o.orderNumber) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(90);
        const num = '#' + o.orderNumber;
        doc.text(num, rightX, y, { align: 'right' });
        rightX -= doc.getTextWidth(num) + 1.3;
        doc.setTextColor(0);
      }
      if (o.mark) rightX = framedMark(rightX, y, o.mark) - 1.3;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(0);
      doc.text(fit(o.customer, rightX - x0 - 1), x0, y);
      y += 3.3;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      o.lines.forEach((l, li) => {
        const qty = [l.pallets ? `${l.pallets} pall` : '', l.boxes ? `${l.boxes} kart` : ''].filter(Boolean).join(' ');
        const qtyW = doc.getTextWidth(qty);
        const wt = !accounting && l.grams ? ` ${l.grams} g` : '';
        const nameMax = Math.max(6, colW - qtyW - 2 - (wt ? doc.getTextWidth(wt) : 0));
        const nm = fit(l.name, nameMax);
        // A faint band behind every other line ties the name to its pallet/price across the gap.
        if (li % 2 === 1) {
          doc.setFillColor(236, 236, 232);
          doc.rect(x0 - 0.6, y - 2.4, colW + 1.2, 3.0, 'F');
        }
        doc.setTextColor(0);
        doc.text(nm, x0, y);
        if (wt) {
          doc.setTextColor(110);
          doc.text(wt, x0 + doc.getTextWidth(nm), y);
          doc.setTextColor(0);
        }
        doc.text(qty, x0 + colW, y, { align: 'right' });
        y += 3.0;
      });
      doc.setFontSize(6.6);
      doc.setTextColor(90);
      doc.text(accounting ? kr(o.amount) : `${o.pallets} pall · ${kg(o.grossKg)}`, x0, y);
      doc.setTextColor(0);
      y += 1.6;
      doc.setDrawColor(215);
      doc.setLineWidth(0.2);
      doc.line(x0, y, x0 + colW, y);
      y += 3.0;
    }
  });

  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(M, footerY - 4, PW - M, footerY - 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(accounting ? `Totalt vecka: ${kr(ob.totalAmount)}${ob.missingPrice ? ' *' : ''}` : `Totalt vecka: ${ob.totalPallets} pall · ${kg(ob.totalGrossKg)}`, M, footerY);
  const billers = accounting ? ob.billers.map((b) => `${b.code} ${kr(b.amount)}`).join('     ') : ob.billers.map((b) => `${b.code} ${b.pallets} pall`).join('    ') + `    kartonger ${kg(ob.totalGoodsKg)}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(billers, PW - M, footerY, { align: 'right' });

  doc.save(filename);
}
