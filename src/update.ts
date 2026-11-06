import { useEffect, useState } from 'react';

// A newer version of the app on the server (or GitHub Pages): an open page keeps running the code
// it loaded, so it asks now and then whether the page it would get today loads other code. The
// built script's name carries a hash of its content, so a different name means a new version.

const CHECK_EVERY_MS = 5 * 60 * 1000;
const SCRIPT = /assets\/index-[\w-]+\.js/;

/** The script this page runs. */
function running(): string | undefined {
  for (const s of document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')) {
    const m = SCRIPT.exec(s.src);
    if (m) return m[0];
  }
  return undefined;
}

/** The script the page would load now (a query makes the service worker go to the network). */
async function published(): Promise<string | undefined> {
  const res = await fetch(`./?update-check=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' });
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return undefined;
  return SCRIPT.exec(await res.text())?.[0];
}

export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const mine = running();
    if (!import.meta.env.PROD || !mine) return;
    let stopped = false;
    const check = () => {
      if (stopped || !navigator.onLine) return;
      published()
        .then((now) => {
          if (!stopped && now && now !== mine) setAvailable(true);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    const visible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', check);
    check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', check);
    };
  }, []);
  return available;
}
