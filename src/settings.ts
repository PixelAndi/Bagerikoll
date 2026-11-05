import { useEffect, useState } from 'react';
import type { Language } from './i18n.ts';
import { applyTheme, type Theme } from './theme.ts';

// This device's own settings, kept in the browser on this device only.

export interface Settings {
  language: Language;
  theme: Theme;
  /** This device's name in the log, e.g. "Packning 1". */
  station: string;
  /** Locked to the packing station: only the packing view, leaving it takes the admin PIN. */
  locked: boolean;
  /** The admin PIN's hash when it has been changed on this device (see domain/pin.ts). */
  pinHash?: string;
  /** The changed PIN's number of digits (the PIN pad checks once that many are typed). */
  pinLength?: number;
  /** A manager's own phone: Produktion opens without the PIN on this device (never on a locked station). */
  productionOpen?: boolean;
  /** The session running at this station. */
  sessionId?: string;
}

const KEY = 'bagerikoll-settings';

function load(): Settings {
  const phone = (navigator.language ?? '').toLowerCase().startsWith('sv') ? 'sv' : 'en';
  const base: Settings = { language: phone, theme: 'auto', station: 'Packning 1', locked: false };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return base;
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
