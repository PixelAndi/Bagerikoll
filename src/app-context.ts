import { createContext, useContext } from 'react';
import type { Translate } from './i18n.ts';
import type { Settings } from './settings.ts';

export interface AppData {
  t: Translate;
  settings: Settings;
  save: (patch: Partial<Settings>) => void;
}

export const AppContext = createContext<AppData | null>(null);

export function useApp(): AppData {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp outside AppContext');
  return v;
}
