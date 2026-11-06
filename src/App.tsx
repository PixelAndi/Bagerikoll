import { useCallback, useEffect, useRef, useState } from 'react';
import { AppContext, useApp } from './app-context.ts';
import { ADMIN_IDLE_MS } from './domain/pin.ts';
import { translator, type TextKey } from './i18n.ts';
import { href, useRoute, type Route } from './router.ts';
import { useSettings } from './settings.ts';
import { startSync } from './sync.ts';
import { SyncBadge } from './ui/SyncBadge.tsx';
import { AdminView } from './ui/AdminView.tsx';
import { Icon } from './ui/common.tsx';
import { DesignView } from './ui/DesignView.tsx';
import { AccountingView } from './ui/AccountingView.tsx';
import { CountView } from './ui/CountView.tsx';
import { DockView } from './ui/DockView.tsx';
import { StationsView } from './ui/StationsView.tsx';
import { MoreView } from './ui/MoreView.tsx';
import { PackView } from './ui/PackView.tsx';
import { LogView } from './ui/ProductionLog.tsx';
import { PinPad } from './ui/PinPad.tsx';
import { OfficeView } from './ui/OfficeView.tsx';
import { ProductionView } from './ui/ProductionView.tsx';
import { ProtocolView } from './ui/ProtocolView.tsx';
import { TodayView } from './ui/TodayView.tsx';

// While the app is tested, a "Beta" badge shows in the header (as in Lönekoll).
const BETA = true;

type TabIcon = 'pack' | 'truck' | 'coin' | 'stations' | 'lock' | 'today' | 'month' | 'days' | 'slips' | 'more';
type Tab = { route: Route; icon: TabIcon; label: TextKey; match: Route['name'][] };
// Tabs by device (Admin sets what a device is):
// - an ordinary device: Stationer (picking one puts the device in kiosk mode), Idag, Logg, Mer;
// - a manager's device (or open admin): Stationer as the live view of every station with the
//   history (Idag, Logg and the protocol are reached from it), Produktion, Kontor, Ekonomi, Mer;
// - accounting's device: Ekonomi and Mer only;
// - a device in kiosk mode: its station and Admin.
const T = {
  stations: { route: { name: 'stations' }, icon: 'stations', label: 'nav.stations', match: ['stations', 'pack', 'dock', 'today', 'log', 'protocol'] },
  today: { route: { name: 'today' }, icon: 'today', label: 'nav.today', match: ['today'] },
  production: { route: { name: 'production' }, icon: 'month', label: 'nav.production', match: ['production'] },
  office: { route: { name: 'office' }, icon: 'days', label: 'nav.office', match: ['office'] },
  accounting: { route: { name: 'accounting' }, icon: 'coin', label: 'nav.accounting', match: ['accounting'] },
  log: { route: { name: 'log' }, icon: 'slips', label: 'nav.log', match: ['log', 'protocol'] },
  more: { route: { name: 'more' }, icon: 'more', label: 'nav.more', match: ['more', 'design', 'admin'] },
} satisfies Record<string, Tab>;
const ORDINARY: Tab[] = [{ ...T.stations, match: ['stations', 'pack', 'dock'] }, T.today, T.log, T.more];
const MANAGER: Tab[] = [T.stations, T.production, T.office, T.accounting, T.more];
const ACCOUNTING: Tab[] = [T.accounting, T.more];
/** The pages accounting's device opens; anything else shows Ekonomi. */
const ACCOUNTING_ROUTES: Route['name'][] = ['accounting', 'more', 'admin', 'design'];

/** The view a locked device shows, and the tab it keeps. */
const KIOSK = {
  pack: { route: { name: 'pack' } as Route, icon: 'pack' as TabIcon, label: 'pack.title' as TextKey, routes: ['pack', 'protocol'] as Route['name'][] },
  dock: { route: { name: 'dock' } as Route, icon: 'truck' as TabIcon, label: 'nav.dock' as TextKey, routes: ['dock', 'count'] as Route['name'][] },
};

export function App() {
  const [settings, save] = useSettings();
  const t = translator(settings.language);
  const route = useRoute();
  const [admin, setAdmin] = useState(false);
  const [pin, setPin] = useState<{ then?: () => void } | null>(null);
  const idle = useRef<number | undefined>(undefined);

  // Admin mode closes by itself after a while without a tap.
  const touch = useCallback(() => {
    window.clearTimeout(idle.current);
    if (admin) idle.current = window.setTimeout(() => setAdmin(false), ADMIN_IDLE_MS);
  }, [admin]);
  useEffect(() => {
    touch();
    window.addEventListener('pointerdown', touch);
    return () => window.removeEventListener('pointerdown', touch);
  }, [touch]);

  const value = {
    t,
    settings,
    save,
    admin,
    askPin: (then?: () => void) => (admin ? then?.() : setPin({ then })),
    closeAdmin: () => setAdmin(false),
  };
  const kiosk = settings.locked ? KIOSK[settings.lockedTo ?? 'pack'] : undefined;
  const accountingOnly = !kiosk && !admin && !!settings.accountingDevice;
  // Sync with the server when the app is opened from it (src/sync.ts).
  const station = useRef(settings.station);
  station.current = settings.station;
  useEffect(() => {
    void startSync(() => station.current);
  }, []);

  return (
    <AppContext.Provider value={value}>
      <div className={`app ${settings.locked ? 'app-station' : ''} ${route.name === 'office' || route.name === 'accounting' || (accountingOnly && !ACCOUNTING_ROUTES.includes(route.name)) ? 'app-wide' : ''}`}>
        <header className="app-header">
          <span className="app-title">
            {t('app.title')}
            {BETA && <span className="beta-badge">{t('beta.badge')}</span>}
          </span>
          <span className="app-tagline">{settings.station}</span>
          <SyncBadge />
          {admin && <span className="admin-badge">{t('admin.badge')}</span>}
        </header>
        {/* Kiosk mode: only the workstation's own pages and Admin. */}
        {kiosk && !kiosk.routes.includes(route.name) && route.name !== 'admin' ? (
          <Screen route={kiosk.route} />
        ) : accountingOnly && !ACCOUNTING_ROUTES.includes(route.name) ? (
          <Screen route={{ name: 'accounting' }} />
        ) : (
          <Screen route={route} />
        )}
        <TabBar route={route} kiosk={kiosk} />
        {pin && (
          <PinPad
            onClose={() => setPin(null)}
            onOk={() => {
              setAdmin(true);
              const then = pin.then;
              setPin(null);
              then?.();
            }}
          />
        )}
      </div>
    </AppContext.Provider>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'today':
      return <TodayView />;
    case 'pack':
      return <PackView />;
    case 'dock':
      return <DockView />;
    case 'accounting':
      return <AccountingView />;
    case 'count':
      return <CountView />;
    case 'production':
      return <ProductionView />;
    case 'office':
      return <OfficeView />;
    case 'protocol':
      return <ProtocolView day={route.day} />;
    case 'log':
      return <LogView />;
    case 'admin':
      return <AdminView />;
    case 'more':
      return <MoreView />;
    case 'design':
      return <DesignView />;
    default:
      return <StationsView />;
  }
}

function TabBar({ route, kiosk }: { route: Route; kiosk?: (typeof KIOSK)[keyof typeof KIOSK] }) {
  const { t, admin, settings } = useApp();
  const manager = admin || !!settings.productionOpen;
  const tabs: Tab[] = kiosk
    ? [
        { route: kiosk.route, icon: kiosk.icon, label: kiosk.label, match: kiosk.routes },
        { route: { name: 'admin' }, icon: 'lock', label: 'nav.admin', match: ['admin'] },
      ]
    : manager
      ? MANAGER
      : settings.accountingDevice
        ? ACCOUNTING.map((tab) => (tab.route.name === 'accounting' ? { ...tab, match: ['accounting', 'stations', 'today', 'log', 'protocol', 'pack', 'dock', 'count', 'production', 'office'] as Route['name'][] } : tab))
        : ORDINARY;
  return (
    <nav className={`tabbar ${kiosk ? 'tabbar-kiosk' : ''}`}>
      {tabs.map((tab) => (
        <a key={tab.label} href={href(tab.route)} className={tab.match.includes(route.name) ? 'active' : ''}>
          <Icon name={tab.icon} />
          <span>{t(tab.label)}</span>
        </a>
      ))}
    </nav>
  );
}
