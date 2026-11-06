import { useState } from 'react';
import { useApp } from '../app-context.ts';
import type { TextKey } from '../i18n.ts';
import { Fold, Icon, Modal, Page } from './common.tsx';
import { OverviewView } from './OverviewView.tsx';

// Stationer. On a manager's device (or with admin open): what every station is doing now and
// the days before (OverviewView); making this device a station is folded away below. On any
// other device: pick what this device is for – a workstation (Packetering, Fryslager) opens and
// the device goes into kiosk mode, only that page and the Admin tab, where the PIN unlocks it.
// (Ekonomi is not a station: it is a tab for managers, and accounting's device shows only it.)

const STATIONS: { to: 'pack' | 'dock'; icon: 'pack' | 'truck'; title: TextKey; hint: TextKey }[] = [
  { to: 'pack', icon: 'pack', title: 'pack.title', hint: 'stations.packHint' },
  { to: 'dock', icon: 'truck', title: 'nav.dock', hint: 'stations.dockHint' },
];

export function StationsView() {
  const { t, admin, settings } = useApp();
  if (admin || settings.productionOpen)
    return (
      <Page title={t('stations.title')}>
        <OverviewView />
        <Fold title={t('stations.makeStation')} sub={t('stations.makeStationSub')}>
          <StationPicker />
        </Fold>
      </Page>
    );
  return (
    <Page title={t('stations.title')}>
      <StationPicker />
    </Page>
  );
}

function StationPicker() {
  const { t, save, closeAdmin } = useApp();
  const [asking, setAsking] = useState<(typeof STATIONS)[number] | null>(null);
  const lock = (to: 'pack' | 'dock') => {
    save({ locked: true, lockedTo: to, productionOpen: false, accountingDevice: false });
    closeAdmin();
    location.hash = `#/${to}`;
  };
  return (
    <>
      <p className="muted">{t('stations.intro')}</p>
      <div className="station-cards">
        {STATIONS.map((s) => (
          <button key={s.to} type="button" className="card station-card" onClick={() => setAsking(s)}>
            <Icon name={s.icon} />
            <strong>{t(s.title)}</strong>
            <span className="small muted">{t(s.hint)}</span>
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
                lock(s.to);
              }}
            >
              {t('stations.yes')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
