import type { Orderbook } from '../domain/orderbook.ts';

// The order book as a landscape-A4 PDF with real, selectable text (drawn with jsPDF, not a picture),
// so it reads upright on a screen, prints sideways, and its text can be copied or searched. jsPDF is
// loaded only when this runs. The layout mirrors the on-screen day columns.

export async function saveOrderbookPdf(ob: Orderbook, filename: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 8;
  const kg = (n: number) => `${n.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} kg`;
  const fit = (text: string, maxW: number) => {
    if (doc.getTextWidth(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
    return t + '…';
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Orderbok — ${ob.weekLabel}`, M, 13);

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
    doc.text(`${d.pallets} pall · ${kg(d.grossKg)}`, x0, y);
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
      const right = [o.mark, o.orderNumber ? '#' + o.orderNumber : ''].filter(Boolean).join(' ');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      const rightW = right ? doc.getTextWidth(right) : 0;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(0);
      doc.text(fit(o.customer, colW - rightW - 1.5), x0, y);
      if (right) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(90);
        doc.text(right, x0 + colW, y, { align: 'right' });
        doc.setTextColor(0);
      }
      y += 3.3;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      for (const l of o.lines) {
        const qty = [l.pallets ? `${l.pallets} pall` : '', l.boxes ? `${l.boxes} kart` : ''].filter(Boolean).join(' ');
        const qtyW = doc.getTextWidth(qty);
        const wt = l.grams ? ` ${l.grams} g` : '';
        const nameMax = Math.max(6, colW - qtyW - 2 - (wt ? doc.getTextWidth(wt) : 0));
        const nm = fit(l.name, nameMax);
        doc.setTextColor(0);
        doc.text(nm, x0, y);
        if (wt) {
          doc.setTextColor(110);
          doc.text(wt, x0 + doc.getTextWidth(nm), y);
          doc.setTextColor(0);
        }
        doc.text(qty, x0 + colW, y, { align: 'right' });
        y += 3.0;
      }
      doc.setFontSize(6.5);
      doc.setTextColor(90);
      doc.text(`${o.pallets} pall · ${kg(o.grossKg)}`, x0, y);
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
  doc.text(`Totalt vecka: ${ob.totalPallets} pall · ${kg(ob.totalGrossKg)}`, M, footerY);
  const billers = ob.billers.map((b) => `${b.code} ${b.pallets} pall`).join('    ') + `    kartonger ${kg(ob.totalGoodsKg)}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(billers, PW - M, footerY, { align: 'right' });

  doc.save(filename);
}
