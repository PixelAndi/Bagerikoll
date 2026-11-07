import { useState } from 'react';
import { useApp } from '../app-context.ts';
import type { LocalDate } from '../days.ts';
import { buildOrderbook, orderbookSheets } from '../domain/orderbook.ts';
import type { Brand, Customer, Order, Product } from '../domain/types.ts';
import { xlsx } from '../xlsx.ts';
import { Modal } from './common.tsx';

// A week's order book as print / PDF / Excel – one button that opens a small chooser (no preview),
// shared by Ekonomi (accounting mode: prices) and Kontor (book mode: shipping pallets and weights).

export function WeekExport({ mode, label, orders, products, customers, brands, monday, weekLabel, week, dayName, disabled }: {
  mode: 'book' | 'accounting';
  label: string;
  orders: Order[];
  products: Product[];
  customers: Customer[];
  brands: Brand[];
  monday: LocalDate;
  weekLabel: string;
  week: { week: number; year: number };
  dayName: (d: LocalDate) => string;
  disabled?: boolean;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileName = (ext: string) => `${mode === 'book' ? 'orderbok' : 'ekonomi'}-v${String(week.week).padStart(2, '0')}-${week.year}.${ext}`;
  const title = mode === 'book' ? t('accounting.orderBookTitle') : t('nav.accounting');

  const doExport = async (what: 'print' | 'pdf' | 'xlsx') => {
    setBusy(true);
    try {
      const ob = buildOrderbook(orders, products, customers, brands, monday, weekLabel, dayName, mode);
      if (what === 'xlsx') {
        const blob = new Blob([xlsx(orderbookSheets(ob, mode)) as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName('xlsx');
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } else {
        const { saveOrderbookPdf } = await import('../pdf/orderbookPdf.ts');
        await saveOrderbookPdf(ob, fileName('pdf'), mode, what === 'print' ? 'print' : 'save');
      }
    } catch {
      // leave the dialog open so they can try again
    }
    setBusy(false);
    if (what !== 'print') setOpen(false);
  };

  return (
    <>
      <button type="button" className="button" disabled={disabled} onClick={() => setOpen(true)}>
        🖨 {label}
      </button>
      {open && (
        <Modal title={`${title} – ${weekLabel}`} onClose={() => setOpen(false)}>
          <p className="small muted">{t('export.hint')}</p>
          <div className="export-choices">
            <button type="button" className="button button-primary" disabled={busy} onClick={() => void doExport('print')}>
              🖨 {t('export.print')}
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => void doExport('pdf')}>
              ⬇ {t('print.savePdf')}
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => void doExport('xlsx')}>
              ⬇ {t('print.saveExcel')}
            </button>
          </div>
          {busy && <p className="small muted">{t('export.working')}</p>}
        </Modal>
      )}
    </>
  );
}
