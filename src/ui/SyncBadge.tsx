import { useApp } from '../app-context.ts';
import { syncNow, useSyncStatus } from '../sync.ts';

// In the header, when the app runs from the server: whether this device is in sync. Tapping it
// syncs now; with an expired login it reloads, which brings up Cloudflare's login.

export function SyncBadge() {
  const { t, settings } = useApp();
  const s = useSyncStatus();
  if (s.state === 'off' || s.state === 'checking') return null;
  const time = s.at ? new Date(s.at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '';
  const text =
    s.state === 'ok' ? `☁ ${t('sync.ok', { time })}` : s.state === 'syncing' ? `⟳ ${t('sync.syncing')}` : s.state === 'offline' ? `⚠ ${t('sync.offline')}` : s.state === 'login' ? `🔑 ${t('sync.login')}` : `⚠ ${t('sync.error')}`;
  return (
    <button
      type="button"
      className={`sync-badge sync-${s.state}`}
      title={s.error ?? text}
      onClick={() => (s.state === 'login' ? location.reload() : void syncNow(settings.station))}
    >
      {text}
    </button>
  );
}
