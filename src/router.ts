import { useEffect, useState } from 'react';

// Hash routes: "#/" (Stationer), "#/pack" (Packetering), "#/dock" (Lastkaj), "#/accounting"
// (Ekonomi), "#/today", "#/production", "#/office", "#/protocol[/YYYY-MM-DD]", "#/log",
// "#/admin", "#/more", "#/design".

export type Route =
  | { name: 'stations' }
  | { name: 'pack' }
  | { name: 'dock' }
  | { name: 'count' }
  | { name: 'accounting' }
  | { name: 'today' }
  | { name: 'production' }
  | { name: 'office' }
  | { name: 'protocol'; day?: string }
  | { name: 'admin' }
  | { name: 'log' }
  | { name: 'more' }
  | { name: 'design' };

const SIMPLE = ['pack', 'dock', 'count', 'accounting', 'today', 'production', 'office', 'log', 'admin', 'more', 'design'] as const;

export function parse(hash: string): Route {
  const [name, arg] = hash.replace(/^#\/?/, '').split('/');
  if (name === 'protocol') return { name, day: /^\d{4}-\d{2}-\d{2}$/.test(arg ?? '') ? arg : undefined };
  if ((SIMPLE as readonly string[]).includes(name)) return { name: name as (typeof SIMPLE)[number] };
  return { name: 'stations' };
}

export const href = (r: Route) => (r.name === 'stations' ? '#/' : r.name === 'protocol' && r.day ? `#/protocol/${r.day}` : `#/${r.name}`);

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
