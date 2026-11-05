import { useEffect, useState } from 'react';

// Hash routes, as in Lönekoll: "#/", "#/calendar", "#/more", "#/design".

export type Route = { name: 'today' } | { name: 'calendar' } | { name: 'more' } | { name: 'design' };

export function parse(hash: string): Route {
  const [name] = hash.replace(/^#\/?/, '').split('/');
  if (name === 'calendar' || name === 'more' || name === 'design') return { name };
  return { name: 'today' };
}

export const href = (r: Route) => (r.name === 'today' ? '#/' : `#/${r.name}`);

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
