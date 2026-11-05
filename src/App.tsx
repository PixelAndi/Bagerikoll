import { AppContext, useApp } from './app-context.ts';
import { translator, type TextKey } from './i18n.ts';
import { href, useRoute, type Route } from './router.ts';
import { useSettings } from './settings.ts';
import { Icon } from './ui/common.tsx';
import { CalendarView } from './ui/CalendarView.tsx';
import { DesignView } from './ui/DesignView.tsx';
import { MoreView } from './ui/MoreView.tsx';
import { TodayView } from './ui/TodayView.tsx';

// While the app is tested, a "Beta" badge shows in the header (as in Lönekoll).
const BETA = true;

const TABS: { route: Route; icon: 'today' | 'days' | 'more'; label: TextKey; match: Route['name'][] }[] = [
  { route: { name: 'today' }, icon: 'today', label: 'nav.today', match: ['today'] },
  { route: { name: 'calendar' }, icon: 'days', label: 'nav.calendar', match: ['calendar'] },
  { route: { name: 'more' }, icon: 'more', label: 'nav.more', match: ['more', 'design'] },
];

export function App() {
  const [settings, save] = useSettings();
  const t = translator(settings.language);
  const route = useRoute();
  return (
    <AppContext.Provider value={{ t, settings, save }}>
      <div className="app">
        <header className="app-header">
          <a href={href({ name: 'today' })} className="app-title">
            {t('app.title')}
            {BETA && <span className="beta-badge">{t('beta.badge')}</span>}
          </a>
          <span className="app-tagline">{t('app.tagline')}</span>
        </header>
        <Screen route={route} />
        <TabBar route={route} />
      </div>
    </AppContext.Provider>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'calendar':
      return <CalendarView />;
    case 'more':
      return <MoreView />;
    case 'design':
      return <DesignView />;
    default:
      return <TodayView />;
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
