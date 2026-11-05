import { useState } from 'react';
import { useApp } from '../app-context.ts';
import type { TextKey } from '../i18n.ts';
import { Icon, Modal, Page } from './common.tsx';

// Stationer: pick what this device is for. A workstation (Packetering, Lastkaj) opens and the
// device goes into kiosk mode – only that page and the Admin tab, where a manager unlocks it with
// the PIN. Ekonomi (accounting) works the same way, but takes the PIN to start, as it shows prices.

const STATIONS: { to: 'pack' | 'dock' | 'accounting'; icon: 'pack' | 'truck' | 'coin'; title: TextKey; hint: TextKey; pin?: boolean }[] = [
  { to: 'pack', icon: 'pack', title: 'pack.title', hint: 'stations.packHint' },
  { to: 'dock', icon: 'truck', title: 'nav.dock', hint: 'stations.dockHint' },
  { to: 'accounting', icon: 'coin', title: 'nav.accounting', hint: 'stations.accountingHint', pin: true },
];

export function StationsView() {
  const { t, save, askPin, closeAdmin } = useApp();
  const [asking, setAsking] = useState<(typeof STATIONS)[number] | null>(null);
  const lock = (to: 'pack' | 'dock' | 'accounting') => {
    save({ locked: true, lockedTo: to, productionOpen: false });
    closeAdmin();
    location.hash = `#/${to}`;
  };
  return (
    <Page title={t('stations.title')}>
      <p className="muted">{t('stations.intro')}</p>
      <div className="station-cards">
        {STATIONS.map((s) => (
          <button key={s.to} type="button" className="card station-card" onClick={() => setAsking(s)}>
            <Icon name={s.icon} />
            <strong>{t(s.title)}</strong>
            <span className="small muted">{t(s.hint)}</span>
            {s.pin && <span className="small">🔒 {t('stations.needsPin')}</span>}
          </button>
        ))}
      </div>
      {asking && (
        <Modal title={t('pack.sure')} onClose={() => setAsking(null)}>
          <p className="pack-pad-show">{t('stations.ask', { station: t(asking.title) })}</p>
          <p className="small muted">{t('stations.askHint')}</p>
          <div className="confirm-buttons">
            <button type="button" className="button confirm-no" onClick={() => setAsking(null)}>
              {t('pack.no')}
            </button>
            <button
              type="button"
              className="button button-primary confirm-yes"
              onClick={() => {
                const s = asking;
                setAsking(null);
                if (s.pin) askPin(() => lock(s.to));
                else lock(s.to);
              }}
            >
              {t('stations.yes')}
            </button>
          </div>
        </Modal>
      )}
    </Page>
  );
}
