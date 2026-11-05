import { useEffect, useState } from 'react';

// Hash routes: "#/" (packa), "#/today", "#/production", "#/protocol[/YYYY-MM-DD]", "#/log", "#/admin", "#/more", "#/design".

export type Route = { name: 'pack' } | { name: 'today' } | { name: 'production' } | { name: 'protocol'; day?: string } | { name: 'admin' } | { name: 'log' } | { name: 'more' } | { name: 'design' };

export function parse(hash: string): Route {
  const [name, arg] = hash.replace(/^#\/?/, '').split('/');
  if (name === 'protocol') return { name, day: /^\d{4}-\d{2}-\d{2}$/.test(arg ?? '') ? arg : undefined };
  if (name === 'today' || name === 'production' || name === 'log' || name === 'admin' || name === 'more' || name === 'design') return { name };
  return { name: 'pack' };
}

export const href = (r: Route) => (r.name === 'pack' ? '#/' : r.name === 'protocol' && r.day ? `#/protocol/${r.day}` : `#/${r.name}`);

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
