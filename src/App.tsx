import { useCallback, useEffect, useRef, useState } from 'react';
import { AppContext, useApp } from './app-context.ts';
import { ADMIN_IDLE_MS } from './domain/pin.ts';
import { translator, type TextKey } from './i18n.ts';
import { href, useRoute, type Route } from './router.ts';
import { useSettings } from './settings.ts';
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
type Tab = { route: Route; icon: TabIcon; label: TextKey; match: Route['name'][]; managers?: boolean };
// Stationer leads to the workstations (picking one puts the device in kiosk mode); the managers'
// tabs (Produktion, Kontor) show only on a manager's device, or while admin is open; Admin itself
// is reached from Mer. A device in kiosk mode (or Ekonomi mode) shows its own tab and Admin.
const TABS: Tab[] = [
  { route: { name: 'stations' }, icon: 'stations', label: 'nav.stations', match: ['stations', 'pack', 'dock', 'accounting'] },
  { route: { name: 'today' }, icon: 'today', label: 'nav.today', match: ['today'] },
  { route: { name: 'production' }, icon: 'month', label: 'nav.production', match: ['production'], managers: true },
  { route: { name: 'office' }, icon: 'days', label: 'nav.office', match: ['office'], managers: true },
  { route: { name: 'log' }, icon: 'slips', label: 'nav.log', match: ['log', 'protocol'] },
  { route: { name: 'more' }, icon: 'more', label: 'nav.more', match: ['more', 'design', 'admin'] },
];

/** The view a locked device shows, and the tab it keeps. */
const KIOSK = {
  pack: { route: { name: 'pack' } as Route, icon: 'pack' as TabIcon, label: 'pack.title' as TextKey, routes: ['pack', 'protocol'] as Route['name'][] },
  dock: { route: { name: 'dock' } as Route, icon: 'truck' as TabIcon, label: 'nav.dock' as TextKey, routes: ['dock', 'count'] as Route['name'][] },
  accounting: { route: { name: 'accounting' } as Route, icon: 'coin' as TabIcon, label: 'nav.accounting' as TextKey, routes: ['accounting'] as Route['name'][] },
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

  return (
    <AppContext.Provider value={value}>
      <div className={`app ${settings.locked ? 'app-station' : ''} ${route.name === 'office' || route.name === 'accounting' || (settings.locked && settings.lockedTo === 'accounting') ? 'app-wide' : ''}`}>
        <header className="app-header">
          <span className="app-title">
            {t('app.title')}
            {BETA && <span className="beta-badge">{t('beta.badge')}</span>}
          </span>
          <span className="app-tagline">{settings.station}</span>
          {admin && <span className="admin-badge">{t('admin.badge')}</span>}
        </header>
        {/* Kiosk mode: only the workstation's own pages and Admin. */}
        {kiosk && !kiosk.routes.includes(route.name) && route.name !== 'admin' ? <Screen route={kiosk.route} /> : <Screen route={route} />}
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
    : TABS.filter((tab) => manager || !tab.managers);
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
