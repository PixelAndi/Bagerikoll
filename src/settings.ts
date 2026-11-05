import { useEffect, useState } from 'react';
import type { Language } from './i18n.ts';
import { applyTheme, type Theme } from './theme.ts';

// The app's own settings, kept in the browser on this phone only.

export interface Settings {
  language: Language;
  theme: Theme;
}

const KEY = 'bagerikoll-settings';

function load(): Settings {
  const phone = (navigator.language ?? '').toLowerCase().startsWith('sv') ? 'sv' : 'en';
  try {
    return { language: phone, theme: 'auto', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { language: phone, theme: 'auto' };
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(load);
  useEffect(() => {
    applyTheme(settings.theme);
    document.documentElement.lang = settings.language;
  }, [settings]);
  const save = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage blocked: the choice lasts until the page is closed.
      }
      return next;
    });
  return [settings, save];
}
