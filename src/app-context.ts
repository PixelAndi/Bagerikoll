import { createContext, useContext } from 'react';
import type { Translate } from './i18n.ts';
import type { Settings } from './settings.ts';

export interface AppData {
  t: Translate;
  settings: Settings;
  save: (patch: Partial<Settings>) => void;
  /** Admin mode is open (the PIN was given; it closes by itself after a while). */
  admin: boolean;
  /** Ask for the PIN; `then` runs once it is right. */
  askPin: (then?: () => void) => void;
  closeAdmin: () => void;
}

export const AppContext = createContext<AppData | null>(null);

export function useApp(): AppData {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp outside AppContext');
  return v;
}
