import { useCallback, useEffect, useRef, useState } from 'react';
import { AppContext, useApp } from './app-context.ts';
import { ADMIN_IDLE_MS } from './domain/pin.ts';
import { translator, type TextKey } from './i18n.ts';
import { href, useRoute, type Route } from './router.ts';
import { useSettings } from './settings.ts';
import { AdminView } from './ui/AdminView.tsx';
import { Icon } from './ui/common.tsx';
import { DesignView } from './ui/DesignView.tsx';
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

type TabIcon = 'pack' | 'today' | 'month' | 'days' | 'slips' | 'lock' | 'more';
const TABS: { route: Route; icon: TabIcon; label: TextKey; match: Route['name'][] }[] = [
  { route: { name: 'pack' }, icon: 'pack', label: 'nav.pack', match: ['pack'] },
  { route: { name: 'today' }, icon: 'today', label: 'nav.today', match: ['today'] },
  { route: { name: 'production' }, icon: 'month', label: 'nav.production', match: ['production'] },
  { route: { name: 'office' }, icon: 'days', label: 'nav.office', match: ['office'] },
  { route: { name: 'log' }, icon: 'slips', label: 'nav.log', match: ['log', 'protocol'] },
  { route: { name: 'admin' }, icon: 'lock', label: 'nav.admin', match: ['admin'] },
  { route: { name: 'more' }, icon: 'more', label: 'nav.more', match: ['more', 'design'] },
];

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
  const locked = settings.locked && !admin;

  return (
    <AppContext.Provider value={value}>
      <div className={`app ${settings.locked ? 'app-station' : ''} ${route.name === 'office' ? 'app-wide' : ''}`}>
        <header className="app-header">
          <span className="app-title">
            {t('app.title')}
            {BETA && <span className="beta-badge">{t('beta.badge')}</span>}
          </span>
          <span className="app-tagline">{settings.station}</span>
          {settings.locked && (
            <button
              type="button"
              className="button button-small"
              onClick={() =>
                value.askPin(() => {
                  save({ locked: false });
                  location.hash = '#/admin';
                })
              }
            >
              🔒 {t('station.unlock')}
            </button>
          )}
          {admin && !settings.locked && <span className="admin-badge">{t('admin.badge')}</span>}
        </header>
        {locked && route.name !== 'protocol' ? <PackView /> : <Screen route={route} />}
        {!settings.locked && <TabBar route={route} />}
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
      return <PackView />;
  }
}

function TabBar({ route }: { route: Route }) {
  const { t } = useApp();
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <a key={tab.label} href={href(tab.route)} className={tab.match.includes(route.name) ? 'active' : ''}>
          <Icon name={tab.icon} />
          <span>{t(tab.label)}</span>
        </a>
      ))}
    </nav>
  );
}
