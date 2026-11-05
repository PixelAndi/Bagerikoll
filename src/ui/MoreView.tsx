import { useApp } from '../app-context.ts';
import { LANGUAGE_NAMES, type Language } from '../i18n.ts';
import { href } from '../router.ts';
import { Card, Field, Icon, Page } from './common.tsx';

// Mer: settings and the rest.

export function MoreView() {
  const { t, settings, save } = useApp();
  return (
    <Page title={t('nav.more')}>
      <Card>
        <Field label={t('more.language')}>
          <select value={settings.language} onChange={(e) => save({ language: e.target.value as Language })}>
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">{t('more.theme')}</span>
          <div className="segmented" role="group" aria-label={t('more.theme')}>
            {(['auto', 'light', 'dark'] as const).map((theme) => (
              <button key={theme} type="button" className={settings.theme === theme ? 'on' : ''} aria-pressed={settings.theme === theme} onClick={() => save({ theme })}>
                {t(`theme.${theme}`)}
              </button>
            ))}
          </div>
        </div>
      </Card>
      <a className="card issue-link" href={href({ name: 'design' })}>
        <span>{t('more.design')}</span>
        <Icon name="chevronRight" />
      </a>
      <Card title={t('more.about')}>
        <p>{t('more.aboutText')}</p>
        <p className="muted small">Version {__APP_VERSION__}</p>
      </Card>
    </Page>
  );
}
