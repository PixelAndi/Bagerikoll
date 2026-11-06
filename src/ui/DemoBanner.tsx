import { useApp } from '../app-context.ts';
import { currentRole, demoLiveRun, demoRole, resetDemo, type DemoRole } from '../demoSite.ts';

// The demo site's bar: made-up data, and what this device is shown as – switched with one tap.

const ROLES: DemoRole[] = ['manager', 'pack', 'dock', 'accounting'];

export function DemoBanner() {
  const { t, settings, save, closeAdmin } = useApp();
  const role = currentRole(settings);
  const show = async (r: DemoRole) => {
    const { settings: patch, hash } = demoRole(r);
    if (r === 'pack') patch.runId = await demoLiveRun();
    closeAdmin();
    save(patch);
    location.hash = hash;
  };
  return (
    <div className="demo-banner no-print">
      <span className="demo-banner-text">
        <strong>{t('demoSite.title')}</strong> {t('demoSite.text')}
      </span>
      <span className="demo-banner-roles" role="group" aria-label={t('demoSite.showAs')}>
        <span className="small">{t('demoSite.showAs')}</span>
        {ROLES.map((r) => (
          <button key={r} type="button" className={`cal-chip ${role === r ? 'pack-chip-on' : ''}`} aria-pressed={role === r} onClick={() => void show(r)}>
            {t(`demoSite.role.${r}`)}
          </button>
        ))}
        <button
          type="button"
          className="link-button small"
          onClick={() => {
            if (confirm(t('demoSite.resetConfirm'))) void resetDemo().then(() => show(role));
          }}
        >
          {t('demoSite.reset')}
        </button>
      </span>
    </div>
  );
}
