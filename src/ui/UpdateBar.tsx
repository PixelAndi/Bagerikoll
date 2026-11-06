import { useApp } from '../app-context.ts';
import { useUpdateAvailable } from '../update.ts';

/** A bar at the top when a newer version of the app is out: one tap reloads into it (nothing is lost – everything is saved as it is made). */
export function UpdateBar() {
  const { t } = useApp();
  if (!useUpdateAvailable()) return null;
  return (
    <div className="update-bar" role="status">
      <span>{t('update.available')}</span>
      <button type="button" className="button button-primary" onClick={() => location.reload()}>
        {t('update.reload')}
      </button>
    </div>
  );
}
