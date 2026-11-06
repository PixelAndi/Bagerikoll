import { useEffect, useState } from 'react';
import type { Language } from './i18n.ts';
import { applyTheme, type Theme } from './theme.ts';

// This device's own settings, kept in the browser on this device only.

export interface Settings {
  language: Language;
  theme: Theme;
  /** This device's name in the log, e.g. "Packning 1". */
  station: string;
  /** Locked to a workstation: only its view; leaving it takes the admin PIN. */
  locked: boolean;
  /** What a locked device shows: the packing station (default) or the freezer. */
  lockedTo?: 'pack' | 'dock';
  /** Accounting's device: shows only Ekonomi (and Mer), without the PIN. Set in Admin. */
  accountingDevice?: boolean;
  /** The link the freezer's QR code opens on a phone (Inventera); empty = this app's own count page. */
  qrLink?: string;
  /** Seconds the QR code stays on screen (default 30). */
  qrSeconds?: number;
  /** The loading dock session running on this device. */
  dockSessionId?: string;
  /** The admin PIN's hash when it has been changed on this device (see domain/pin.ts). */
  pinHash?: string;
  /** The changed PIN's number of digits (the PIN pad checks once that many are typed). */
  pinLength?: number;
  /** A manager's device (own phone, the office computer): Produktion and Kontor are shown and open without the PIN (never on a locked station). Other devices don't show them. */
  productionOpen?: boolean;
  /** The run (product on the line) open at this station. */
  runId?: string;
  /** The session running at this station. */
  sessionId?: string;
}

const KEY = 'bagerikoll-settings';

function load(): Settings {
  const phone = (navigator.language ?? '').toLowerCase().startsWith('sv') ? 'sv' : 'en';
  const base: Settings = { language: phone, theme: 'auto', station: 'Packning 1', locked: false };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Omit<Partial<Settings>, 'lockedTo'> & { lockedTo?: string };
    // Ekonomi used to be a kiosk station; it is now a kind of device.
    if (stored.lockedTo === 'accounting') return { ...base, ...stored, locked: false, lockedTo: undefined, accountingDevice: true };
    return { ...base, ...stored } as Settings;
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
