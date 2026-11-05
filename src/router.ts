import { useEffect, useState } from 'react';

// Hash routes: "#/" (packa), "#/today", "#/production", "#/log", "#/admin", "#/more", "#/design".

export type Route = { name: 'pack' } | { name: 'today' } | { name: 'production' } | { name: 'admin' } | { name: 'log' } | { name: 'more' } | { name: 'design' };

export function parse(hash: string): Route {
  const [name] = hash.replace(/^#\/?/, '').split('/');
  if (name === 'today' || name === 'production' || name === 'log' || name === 'admin' || name === 'more' || name === 'design') return { name };
  return { name: 'pack' };
}

export const href = (r: Route) => (r.name === 'pack' ? '#/' : `#/${r.name}`);

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
