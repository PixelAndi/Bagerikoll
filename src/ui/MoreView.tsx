import { useRef, useState } from 'react';
import { useApp } from '../app-context.ts';
import { readDataFile, saveDataFile, type ReadResult } from '../datafile.ts';
import { LANGUAGE_NAMES, type Language } from '../i18n.ts';
import { href } from '../router.ts';
import { Card, Field, Icon, Notice, Page } from './common.tsx';

// Mer: settings and the rest.

export function MoreView() {
  const { t, settings, save } = useApp();
  return (
    <Page title={t('nav.more')}>
      <a className="card issue-link" href={href({ name: 'admin' })}>
        <span>
          <strong>🔒 {t('nav.admin')}</strong>
          <br />
          <span className="small muted">{t('more.adminHint')}</span>
        </span>
        <Icon name="chevronRight" />
      </a>
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
      <DataFile />
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

/** Moving data between devices by file, until there is a shared server. */
function DataFile() {
  const { t, settings } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ReadResult | 'saved' | 'error' | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveDataFile(settings.station);
      setResult('saved');
    } catch {
      // Closed the share sheet: nothing to say.
    } finally {
      setBusy(false);
    }
  };
  const read = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      setResult(await readDataFile(file));
    } catch {
      setResult('error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <Card title={t('data.title')}>
      <p className="small muted">{t('data.hint')}</p>
      <div className="button-row">
        <button type="button" className="button button-primary" disabled={busy} onClick={() => void save()}>
          {t('data.save')}
        </button>
        <button type="button" className="button" disabled={busy} onClick={() => input.current?.click()}>
          {t('data.read')}
        </button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void read(e.target.files?.[0])} />
      </div>
      {result === 'saved' && <Notice kind="ok">{t('data.saved')}</Notice>}
      {result === 'error' && <Notice kind="error">{t('data.notAFile')}</Notice>}
      {result && typeof result === 'object' && (
        <Notice kind="ok">
          {t('data.readDone', {
            from: result.from,
            when: new Date(result.savedAt).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
            added: result.added,
            updated: result.updated,
          })}
        </Notice>
      )}
    </Card>
  );
}
