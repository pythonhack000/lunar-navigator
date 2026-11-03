import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import { useT } from '../i18n';
import { DAY_MS, HOUR_MS } from '../lib/format';
import { sampleTimeline } from '../lib/visibility';
import { useNavigator } from '../state/store';

type Props = { analysis: SiteAnalysis; onClose: () => void };

const MONTHS_SHOWN = 3;
const UP = 0.5;
const CELL = 7;
const LABEL_W = 46;
const HOURS = 24;

type CellState = 'both' | 'sun' | 'earth' | 'none';

const startOfMonth = (time: number) => {
  const d = new Date(time);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
const addMonths = (time: number, n: number) => {
  const d = new Date(time);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
};

/**
 * Hour-by-hour landing windows for three months: amber where only the Sun is up, blue where only
 * Earth is, bright where both are (power and a direct radio link at once). Click an hour to go there.
 */
export function LandingCalendar({ analysis, onClose }: Props) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const setTime = useNavigator((s) => s.setTime);
  const [start, setStart] = useState(() => startOfMonth(useNavigator.getState().time));
  const end = addMonths(start, MONTHS_SHOWN);
  const days = Math.round((end - start) / DAY_MS);

  const cells = useMemo(() => {
    const tl = sampleTimeline(analysis.site, analysis.profile, start, days * DAY_MS - HOUR_MS, HOUR_MS);
    return Array.from(tl.sun, (s, i): CellState => {
      const e = tl.earth[i];
      if (s >= UP && e >= UP) return 'both';
      if (s >= UP) return 'sun';
      return e >= UP ? 'earth' : 'none';
    });
  }, [analysis.site, analysis.profile, start, days]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const monthName = (time: number) =>
    new Date(time).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const width = LABEL_W + HOURS * CELL;
  const height = days * CELL;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="panel calendar" role="dialog" aria-label={t('cal.title')} onClick={(e) => e.stopPropagation()}>
        <header className="calendar__head">
          <h2>{t('cal.title')}</h2>
          <button type="button" className="icon-button" aria-label={t('cal.close')} onClick={onClose}>×</button>
        </header>
        <div className="calendar__nav">
          <button type="button" className="ghost-button" onClick={() => setStart(addMonths(start, -1))} aria-label="−1">‹</button>
          <span>{monthName(start)} — {monthName(addMonths(start, MONTHS_SHOWN - 1))}</span>
          <button type="button" className="ghost-button" onClick={() => setStart(addMonths(start, 1))} aria-label="+1">›</button>
        </div>
        <p className="muted">{t('cal.hint')}</p>
        <div className="calendar__legend">
          {(['both', 'sun', 'earth', 'none'] as const).map((k) => (
            <span key={k} className={`cal-key cal-key--${k}`}>{t(`cal.${k}`)}</span>
          ))}
        </div>
        <div className="calendar__grid">
          <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={t('cal.title')}>
            {Array.from({ length: days }, (_, d) => {
              const dayTime = start + d * DAY_MS;
              const date = new Date(dayTime);
              const isFirst = date.getUTCDate() === 1;
              return (
                <g key={d}>
                  {(date.getUTCDate() % 5 === 1 || isFirst) && (
                    <text x={LABEL_W - 6} y={d * CELL + CELL - 1} textAnchor="end" className={isFirst ? 'cal-label is-month' : 'cal-label'}>
                      {date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                    </text>
                  )}
                  {Array.from({ length: HOURS }, (_, h) => (
                    <rect
                      key={h}
                      x={LABEL_W + h * CELL}
                      y={d * CELL}
                      width={CELL - 1}
                      height={CELL - 1}
                      className={`cal-cell cal-cell--${cells[d * HOURS + h] ?? 'none'}`}
                      onClick={() => {
                        setTime(dayTime + h * HOUR_MS);
                        onClose();
                      }}
                    />
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
      </section>
    </div>,
    document.body,
  );
}
