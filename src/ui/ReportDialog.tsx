import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { DAY_MS, toDateTimeInput } from '../lib/format';
import { periodRange, type PeriodRange, type ReportPeriod } from '../lib/periodReport';
import { useNavigator } from '../state/store';

type Props = { onCreate: (range: PeriodRange) => void; onClose: () => void };

const PERIODS: ReportPeriod[] = ['week', 'month', 'quarter', 'custom'];
const dateOnly = (time: number) => toDateTimeInput(time).slice(0, 10);

/** Choose what the PDF report covers: a preset span from today, or two dates. */
export function ReportDialog({ onCreate, onClose }: Props) {
  const t = useT();
  const [now] = useState(() => useNavigator.getState().time);
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [from, setFrom] = useState(() => dateOnly(now));
  const [to, setTo] = useState(() => dateOnly(now + 14 * DAY_MS));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="panel report-dialog" role="dialog" aria-label={t('report.title')} onClick={(e) => e.stopPropagation()}>
        <header className="calendar__head">
          <h2>{t('report.title')}</h2>
          <button type="button" className="icon-button" aria-label={t('cal.close')} onClick={onClose}>×</button>
        </header>
        <p className="muted">{t('report.hint')}</p>
        <div className="segmented report-dialog__periods" role="group" aria-label={t('compare.period')}>
          {PERIODS.map((p) => (
            <button key={p} type="button" className={p === period ? 'is-active' : undefined} aria-pressed={p === period} onClick={() => setPeriod(p)}>
              {t(`period.${p}`)}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="compare__range">
            <label>{t('compare.from')} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>{t('compare.to')} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
        <p className="muted report-dialog__how">{t('report.how')}</p>
        <button type="button" className="primary-button report-dialog__go" onClick={() => onCreate(periodRange(period, now, from, to))}>
          {t('report.create')}
        </button>
      </section>
    </div>,
    document.body,
  );
}
