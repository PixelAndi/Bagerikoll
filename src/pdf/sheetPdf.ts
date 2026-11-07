// Save a printable sheet (the order book, the week report) as a landscape A4 PDF: it reads upright
// on a screen and prints sideways on any device, without depending on the print dialog's
// orientation. The page's HTML is captured as it looks, so the PDF matches the print exactly.
// jsPDF and html2canvas are loaded only when this runs (a station never downloads them).

export async function saveSheetPdf(source: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  // Capture a detached copy at a fixed landscape width, so every column shows and the visible page
  // doesn't flash. The app's styles apply to it through the shared stylesheet.
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.left = '-10000px';
  clone.style.top = '0';
  clone.style.width = '1040px';
  clone.style.maxWidth = 'none';
  clone.style.background = '#ffffff';
  clone.style.padding = '8px 10px';
  for (const el of clone.querySelectorAll<HTMLElement>('.week-sheet')) el.style.aspectRatio = 'auto';
  document.body.appendChild(clone);

  try {
    const canvas = await html2canvas(clone, { scale: 2, backgroundColor: '#ffffff', logging: false, windowWidth: 1060 });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const availW = pageW - margin * 2;
    const availH = pageH - margin * 2;
    const ratio = canvas.width / canvas.height;
    let w = availW;
    let h = w / ratio;
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }
    const img = canvas.toDataURL('image/png');
    pdf.addImage(img, 'PNG', (pageW - w) / 2, margin, w, h, undefined, 'FAST');
    pdf.save(filename);
  } finally {
    document.body.removeChild(clone);
  }
}
