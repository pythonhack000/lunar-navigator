import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import { siteLabel, useT } from '../i18n';
import { sampleDsn } from '../lib/dsn';
import { DAY_MS, HOUR_MS } from '../lib/format';
import { DEFAULT_REQUIREMENTS, findWindows, missionSeries, type MissionRequirements } from '../lib/missionWindow';
import { sampleTimeline } from '../lib/visibility';
import { useNavigator } from '../state/store';
import { MissionFilter } from './MissionFilter';

type Props = { analysis: SiteAnalysis; onClose: () => void };

const UP = 0.5;
const HOURS = 24;
/** Mission windows look a year ahead, every 3 hours: fine enough for a landing date, and quick. */
const SEARCH_DAYS = 365;
const SEARCH_STEP_MS = 3 * HOUR_MS;

interface Day {
  start: number;
  both: number;
  sun: number;
  earth: number;
  /** First hour with both Sun and Earth up (or Sun only), where a click should land. */
  bestHour: number;
}

const startOfMonth = (time: number) => {
  const d = new Date(time);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
const addMonths = (time: number, n: number) => {
  const d = new Date(time);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
};

/**
 * One month of landing windows: each day shows how many hours have both the Sun (power) and Earth
 * (direct radio) above the terrain, with smaller bars for each on its own. Click a day to go there.
 */
export function LandingCalendar({ analysis, onClose }: Props) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const setTime = useNavigator((s) => s.setTime);
  const [month, setMonth] = useState(() => startOfMonth(useNavigator.getState().time));
  const next = addMonths(month, 1);
  const dayCount = Math.round((next - month) / DAY_MS);
  const [requirements, setRequirements] = useState<MissionRequirements>(DEFAULT_REQUIREMENTS);
  const [searchStart] = useState(() => Math.floor(useNavigator.getState().time / DAY_MS) * DAY_MS);

  const year = useMemo(
    () => ({
      timeline: sampleTimeline(analysis.site, analysis.profile, searchStart, SEARCH_DAYS * DAY_MS, SEARCH_STEP_MS),
      dsn: sampleDsn(searchStart, SEARCH_DAYS * DAY_MS, SEARCH_STEP_MS),
    }),
    [analysis.site, analysis.profile, searchStart],
  );
  const windows = useMemo(
    () => findWindows(missionSeries(year.timeline, analysis.profile, year.dsn.station, requirements.antennaMaskDeg), searchStart, SEARCH_STEP_MS, requirements),
    [year, analysis.profile, requirements, searchStart],
  );
  const fitsMission = (dayStart: number) => windows.some((w) => w.from < dayStart + DAY_MS && w.to >= dayStart);
  const goTo = (time: number) => {
    setTime(time);
    onClose();
  };

  const days = useMemo<Day[]>(() => {
    const tl = sampleTimeline(analysis.site, analysis.profile, month, dayCount * DAY_MS - HOUR_MS, HOUR_MS);
    return Array.from({ length: dayCount }, (_, d) => {
      let both = 0;
      let sun = 0;
      let earth = 0;
      let bestHour = -1;
      let sunHour = -1;
      for (let h = 0; h < HOURS; h++) {
        const s = tl.sun[d * HOURS + h] >= UP;
        const e = tl.earth[d * HOURS + h] >= UP;
        if (s) sun++;
        if (e) earth++;
        if (s && e) {
          both++;
          if (bestHour < 0) bestHour = h;
        }
        if (s && sunHour < 0) sunHour = h;
      }
      return { start: month + d * DAY_MS, both, sun, earth, bestHour: bestHour >= 0 ? bestHour : Math.max(0, sunHour) };
    });
  }, [analysis.site, analysis.profile, month, dayCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';
  // Monday-first week; getUTCDay() is 0 for Sunday.
  const leadingBlanks = (new Date(month).getUTCDay() + 6) % 7;
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }),
  );
  const bestDay = days.reduce((a, b) => (b.both > a.both ? b : a), days[0]);

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="panel calendar" role="dialog" aria-label={t('cal.title')} onClick={(e) => e.stopPropagation()}>
        <header className="calendar__head">
          <div>
            <h2>{t('cal.title')}</h2>
            <p className="muted">{siteLabel(site, lang)}</p>
          </div>
          <button type="button" className="icon-button" aria-label={t('cal.close')} onClick={onClose}>×</button>
        </header>
        <div className="calendar__nav">
          <button type="button" className="ghost-button" onClick={() => setMonth(addMonths(month, -1))} aria-label="‹">‹</button>
          <span>{new Date(month).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
          <button type="button" className="ghost-button" onClick={() => setMonth(next)} aria-label="›">›</button>
        </div>
        <div className="calendar__body">
        <MissionFilter requirements={requirements} onChange={setRequirements} windows={windows} onGo={goTo} />
        <div className="calendar__month">
        <p className="muted calendar__hint">{t('cal.hint')}</p>
        <div className="month-grid">
          {weekdays.map((w) => (
            <span key={w} className="month-grid__weekday">{w}</span>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => <span key={`b${i}`} />)}
          {days.map((d, i) => (
            <button
              key={d.start}
              type="button"
              className={`day-cell${d === bestDay && d.both > 0 ? ' is-best' : ''}${fitsMission(d.start) ? ' is-fit' : ''}`}
              style={{ ['--both' as string]: d.both / HOURS }}
              onClick={() => goTo(d.start + d.bestHour * HOUR_MS)}
              title={`${t('cal.both')}: ${d.both} ${t('h')} · ${t('cal.sun')}: ${d.sun} ${t('h')} · ${t('cal.earth')}: ${d.earth} ${t('h')}`}
            >
              <span className="day-cell__num">{i + 1}</span>
              <span className="day-cell__both">{d.both > 0 ? `${d.both} ${t('h')}` : '—'}</span>
              <span className="day-cell__bars">
                <span className="bar bar--sun" style={{ width: `${(d.sun / HOURS) * 100}%` }} />
                <span className="bar bar--earth" style={{ width: `${(d.earth / HOURS) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
        <div className="calendar__legend">
          <span className="cal-key cal-key--both">{t('cal.both')}</span>
          <span className="cal-key cal-key--sun">{t('cal.sun')}</span>
          <span className="cal-key cal-key--earth">{t('cal.earth')}</span>
          <span className="cal-key cal-key--fit">{t('mission.key')}</span>
        </div>
        </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
