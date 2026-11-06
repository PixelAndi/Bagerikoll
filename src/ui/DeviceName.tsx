import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { Notice } from './common.tsx';

// The device's name (the station in the log). Until it has one, the header shows a field to type
// it straight in; once given, it shows the name, changed in Admin.

export function DeviceName() {
  const { t, settings, save } = useApp();
  const [text, setText] = useState('');
  if (settings.station) return <span className="app-tagline">{settings.station}</span>;
  const done = () => text.trim() && save({ station: text.trim().slice(0, 40) });
  return (
    <form
      className="device-name"
      onSubmit={(e) => {
        e.preventDefault();
        done();
      }}
    >
      <input type="text" value={text} placeholder={t('device.namePlaceholder')} aria-label={t('device.nameLabel')} onChange={(e) => setText(e.target.value)} onBlur={done} enterKeyHint="done" />
      {text.trim() && (
        <button type="submit" className="button button-primary">
          {t('admin.save')}
        </button>
      )}
    </form>
  );
}

/** A device without a name can't start a session: what it registers carries the name. */
export function NeedsName() {
  const { t } = useApp();
  return <Notice kind="warn">{t('device.nameFirst')}</Notice>;
}
