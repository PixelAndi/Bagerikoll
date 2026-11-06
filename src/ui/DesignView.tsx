import { useApp } from '../app-context.ts';
import { href } from '../router.ts';
import { palletLayers } from '../domain/pallet.ts';
import { Card, Fold, Notice, Page } from './common.tsx';
import { PalletBadge } from './PalletIcon.tsx';

// The building blocks the pages are made of, as in Lönekoll – with made-up examples, so the look
// can be seen and reused. The class names are the ones in styles.css.

export function DesignView() {
  const { t } = useApp();
  return (
    <Page title={t('design.title')}>
      <a className="small" href={href({ name: 'more' })}>
        ‹ {t('common.back')}
      </a>
      <p className="muted small">{t('design.intro')}</p>

      <h2 className="issues-heading">{t('design.focus')}</h2>
      {/* .cal-focus: the card for what applies now, with its counts. */}
      <section className="card cal-focus">
        <div className="cal-focus-head">
          <strong>{t('design.example')}</strong>
          <a href={href({ name: 'design' })}>›</a>
        </div>
        <div className="cal-counts">
          <span className="cal-count cal-worked">
            <strong>12</strong>
            {t('design.ok')}
          </span>
          <span className="cal-count cal-sick">
            <strong>1</strong>
            {t('design.bad')}
          </span>
          <span className="cal-count cal-vacation">
            <strong>3</strong>
            {t('design.example')}
          </span>
          <span className="cal-count cal-holiday">
            <strong>2</strong>
            {t('design.example')}
          </span>
        </div>
      </section>

      <h2 className="issues-heading">{t('design.pallets')}</h2>
      {/* PalletIcon / PalletBadge: the pallet at its height – 4 large boxes a layer unless the product says otherwise. */}
      <div className="design-pallets">
        {Array.from({ length: 40 }, (_, i) => i + 1).map((n) => (
          <PalletBadge key={n} boxes={n} label={t('pallet.label', { boxes: n, layers: palletLayers(n).layers })} unit={0.8} />
        ))}
      </div>
      {/* Two full pallets of 20 on top of each other: how most are stored and shipped. */}
      <h3 className="prod-sub">{t('pallet.stackedTitle')}</h3>
      <div className="design-pallets-stacked">
        <PalletBadge boxes={20} stacked={2} label={t('pallet.stacked', { boxes: 20 })} unit={1} />
      </div>

      <h2 className="issues-heading">{t('design.chips')}</h2>
      {/* .cal-chips / .cal-chip(-ok|-warn|-vacation) */}
      <div className="cal-chips">
        <span className="cal-chip cal-chip-ok">✓ {t('design.ok')}</span>
        <span className="cal-chip cal-chip-warn">{t('design.warn')}</span>
        <span className="cal-chip cal-chip-vacation">{t('design.example')}</span>
        <span className="cal-chip">{t('design.example')}</span>
      </div>

      {/* .cal-numbers: two columns of big figures with a line under each. */}
      <Card title={t('design.numbers')}>
        <div className="cal-numbers">
          <div>
            <strong>1 234</strong>
            <span className="small muted">{t('design.example')}</span>
          </div>
          <div>
            <strong>56 %</strong>
            <span className="small muted">{t('design.example')}</span>
          </div>
        </div>
      </Card>

      {/* .cal-check: the yellow card for what needs a look. */}
      <Card title={t('design.check')} className="cal-check">
        <ul className="cal-check-list">
          <li>
            <span>{t('design.checkRow')}</span>
            <a href={href({ name: 'design' })}>›</a>
          </li>
        </ul>
      </Card>

      <h2 className="issues-heading">{t('design.squares')}</h2>
      {/* .pay-squares / .pay-sq-(ok|warn|bad|none|later|now) */}
      <div className="pay-squares">
        {(['ok', 'ok', 'warn', 'bad', 'none', 'now'] as const).map((k, i) => (
          <span key={i} className={`pay-sq pay-sq-${k}`}>
            <strong>{i + 1}</strong>
            <span>{k === 'ok' ? '✓' : k === 'none' ? '' : k === 'now' ? '…' : '!'}</span>
          </span>
        ))}
      </div>

      <h2 className="issues-heading">{t('design.tiles')}</h2>
      {/* .kon-tiles / .kon-tile.kon-(ok|warn|bad) */}
      <div className="kon-tiles">
        {(['ok', 'warn', 'bad', 'ok'] as const).map((k, i) => (
          <span key={i} className={`kon-tile kon-${k}`}>
            <span className="kon-tile-head">
              <strong>{t('design.example')}</strong>
              <strong className="kon-tile-n">{k === 'ok' ? '✓' : i}</strong>
            </span>
            <span className="kon-tile-sub">{t(k === 'ok' ? 'design.ok' : k === 'warn' ? 'design.warn' : 'design.bad')}</span>
          </span>
        ))}
      </div>

      <h2 className="issues-heading">{t('design.fold')}</h2>
      <Fold title={t('design.example')} sub={t('design.foldSub')}>
        <p>{t('design.foldBody')}</p>
      </Fold>

      <h2 className="issues-heading">{t('design.notices')}</h2>
      <Notice kind="info">{t('design.example')}</Notice>
      <Notice kind="ok">{t('design.ok')}</Notice>
      <Notice kind="warn">{t('design.warn')}</Notice>
      <Notice kind="error">{t('design.bad')}</Notice>

      <h2 className="issues-heading">{t('design.buttons')}</h2>
      <div className="button-row">
        <button type="button" className="button button-primary">
          {t('design.example')}
        </button>
        <button type="button" className="button">
          {t('design.example')}
        </button>
        <button type="button" className="button button-danger">
          {t('design.bad')}
        </button>
      </div>
    </Page>
  );
}
